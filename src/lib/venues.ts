import type { Amenity, Court, VenueMarketplaceRow, VenueOperatingHours } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/** Same public bucket as the web's getPublicImageUrl() — pure URL
 * construction, no network call. */
export function publicImageUrl(storagePath: string): string {
  return supabase.storage.from('venue-images').getPublicUrl(storagePath).data.publicUrl;
}

/**
 * The Explore list. venue_marketplace is already RLS-scoped to active
 * venues; "recommended" is the web's deterministic ranking — rating
 * first, ties broken by review count. `q` mirrors the web's full search
 * semantics: the venue's own name/city/address, OR any of its courts'
 * names (courts' public RLS already scopes that lookup to active courts
 * of active venues).
 */
export async function listMarketplaceVenues(q?: string): Promise<VenueMarketplaceRow[]> {
  let query = supabase.from('venue_marketplace').select('*');

  const term = q?.trim().replace(/[%_,()]/g, ' ').trim();
  if (term) {
    const { data: courtMatches, error: courtError } = await supabase
      .from('courts')
      .select('venue_id')
      .ilike('name', `%${term}%`);
    if (courtError) throw courtError;

    const orParts = [`name.ilike.%${term}%`, `city.ilike.%${term}%`, `address.ilike.%${term}%`];
    const matchingVenueIds = [...new Set((courtMatches ?? []).map((row) => row.venue_id))];
    if (matchingVenueIds.length > 0) {
      orParts.push(`id.in.(${matchingVenueIds.join(',')})`);
    }
    query = query.or(orParts.join(','));
  }

  const { data, error } = await query
    .order('average_rating', { ascending: false })
    .order('review_count', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export type VenueDetail = VenueMarketplaceRow & {
  courts: Court[];
  amenities: Amenity[];
  hours: VenueOperatingHours[];
  /** First venue-level image, else first court image — same "cover" rule
   * as the web. */
  imagePaths: string[];
};

export async function getVenueDetail(venueId: string): Promise<VenueDetail | null> {
  const [venueResult, courtsResult, amenityLinksResult, hoursResult, imagesResult] =
    await Promise.all([
      supabase.from('venue_marketplace').select('*').eq('id', venueId).maybeSingle(),
      supabase
        .from('courts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('status', 'active')
        .order('hourly_price', { ascending: true }),
      supabase.from('venue_amenities').select('*').eq('venue_id', venueId),
      supabase
        .from('venue_operating_hours')
        .select('*')
        .eq('venue_id', venueId)
        .order('day_of_week', { ascending: true }),
      supabase
        .from('court_images')
        .select('*')
        .eq('venue_id', venueId)
        .order('sort_order', { ascending: true }),
    ]);

  if (venueResult.error) throw venueResult.error;
  if (!venueResult.data) return null;
  if (courtsResult.error) throw courtsResult.error;
  if (amenityLinksResult.error) throw amenityLinksResult.error;
  if (hoursResult.error) throw hoursResult.error;
  if (imagesResult.error) throw imagesResult.error;

  const amenityIds = (amenityLinksResult.data ?? []).map((row) => row.amenity_id);
  let amenities: Amenity[] = [];
  if (amenityIds.length > 0) {
    const { data, error } = await supabase.from('amenities').select('*').in('id', amenityIds);
    if (error) throw error;
    amenities = (data ?? []).sort((a, b) => a.name.localeCompare(b.name));
  }

  // Venue-level photos (court_id null) lead, then court photos — the
  // lowest-sort venue-level image is the cover, matching the marketplace
  // view's cover_image_path.
  const images = imagesResult.data ?? [];
  const imagePaths = [
    ...images.filter((img) => img.court_id === null),
    ...images.filter((img) => img.court_id !== null),
  ].map((img) => img.storage_path);

  return {
    ...venueResult.data,
    courts: courtsResult.data ?? [],
    amenities,
    hours: hoursResult.data ?? [],
    imagePaths,
  };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "9:00 AM – 10:00 PM" from Postgres "09:00:00"/"22:00:00". */
function formatTimeRange(start: string, end: string): string {
  const fmt = (hms: string) => {
    const [h, m] = hms.split(':').map(Number);
    const period = h < 12 ? 'AM' : 'PM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export type DaySchedule = { day: string; hours: string };

export type CondensedSchedule = { label: string; hours: string };

/**
 * The weekly schedule with consecutive same-hours days folded together —
 * most venues run one schedule all week, and seven identical rows bury
 * everything below them. "Daily · 6 AM – 12 PM, 1 PM – 11 PM" says the
 * same thing in one line; a split week comes out as "Mon – Fri · …" plus
 * "Sat – Sun · …".
 */
export function condensedSchedule(rows: VenueOperatingHours[]): CondensedSchedule[] {
  const week = weeklySchedule(rows);
  const groups: { days: string[]; hours: string }[] = [];
  for (const entry of week) {
    const last = groups[groups.length - 1];
    if (last && last.hours === entry.hours) {
      last.days.push(entry.day);
    } else {
      groups.push({ days: [entry.day], hours: entry.hours });
    }
  }
  return groups.map((g) => ({
    label:
      g.days.length === 7
        ? 'Daily'
        : g.days.length === 1
          ? g.days[0]
          : `${g.days[0].slice(0, 3)} – ${g.days[g.days.length - 1].slice(0, 3)}`,
    hours: g.hours,
  }));
}

/** One line per weekday, Monday-first, "Closed" where no row exists. */
export function weeklySchedule(rows: VenueOperatingHours[]): DaySchedule[] {
  const byDay = new Map<number, VenueOperatingHours[]>();
  for (const row of rows) {
    const list = byDay.get(row.day_of_week) ?? [];
    list.push(row);
    byDay.set(row.day_of_week, list);
  }
  // Monday (1) through Sunday (0, shown last) — the order people read
  // opening hours in, not Postgres's day_of_week order.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((day) => {
    const ranges = (byDay.get(day) ?? [])
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((row) => formatTimeRange(row.start_time, row.end_time));
    return { day: DAY_NAMES[day], hours: ranges.length > 0 ? ranges.join(', ') : 'Closed' };
  });
}
