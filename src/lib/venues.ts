import type { Amenity, Court, VenueMarketplaceRow, VenueOperatingHours } from '@/lib/database.types';
import { computeOpenStatus, type OpenStatus } from '@/lib/open-status';
import { supabase } from '@/lib/supabase';

/** Same public bucket as the web's getPublicImageUrl() — pure URL
 * construction, no network call. */
export function publicImageUrl(storagePath: string): string {
  return supabase.storage.from('venue-images').getPublicUrl(storagePath).data.publicUrl;
}

export type VenueSortOption = 'recommended' | 'price_asc' | 'price_desc' | 'rating';

/** Same shape as the web's MarketplaceFilters, minus the geolocation
 * radius filter. expo-location ships as a dependency from build 10, but
 * no code requests permission yet, so there is still no position to
 * filter on — the blocker moved from "needs a native rebuild" to "needs
 * a decision about when to prompt". */
export type MarketplaceFilters = {
  q?: string;
  indoorOutdoor?: 'indoor' | 'outdoor';
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  amenityIds?: string[];
  surfaceType?: string;
  availableOn?: string;
  availableAt?: string;
  sort?: VenueSortOption;
};

export type MarketplaceVenue = VenueMarketplaceRow & { openStatus: OpenStatus };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The Explore list. venue_marketplace is already RLS-scoped to active
 * venues. Filter semantics mirror the web's searchMarketplaceVenues()
 * exactly: `q` matches the venue's own name/city/address OR any of its
 * courts' names; amenities use AND semantics (a venue must have every
 * selected amenity); availableOn/At is an operating-hours approximation,
 * not a live per-court slot check.
 */
export async function listMarketplaceVenues(filters: MarketplaceFilters = {}): Promise<MarketplaceVenue[]> {
  let query = supabase.from('venue_marketplace').select('*');

  const term = filters.q?.trim().replace(/[%_,()]/g, ' ').trim();
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

  if (filters.indoorOutdoor) {
    query = query.eq('indoor_outdoor', filters.indoorOutdoor);
  }
  if (filters.minPrice !== undefined) {
    query = query.gte('starting_price', filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    query = query.lte('starting_price', filters.maxPrice);
  }
  if (filters.minRating !== undefined) {
    query = query.gte('average_rating', filters.minRating);
  }

  if (filters.surfaceType) {
    const { data: surfaceCourts, error: surfaceError } = await supabase
      .from('courts')
      .select('venue_id')
      .ilike('surface_type', filters.surfaceType);
    if (surfaceError) throw surfaceError;
    const surfaceVenueIds = [...new Set((surfaceCourts ?? []).map((row) => row.venue_id))];
    query = query.in('id', surfaceVenueIds.length > 0 ? surfaceVenueIds : ['00000000-0000-0000-0000-000000000000']);
  }

  if (filters.availableOn) {
    const date = new Date(`${filters.availableOn}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      const dayOfWeek = date.getUTCDay();
      const { data: hoursRows, error: hoursError } = await supabase
        .from('venue_operating_hours')
        .select('venue_id, start_time, end_time')
        .eq('day_of_week', dayOfWeek);
      if (hoursError) throw hoursError;

      let matching = hoursRows ?? [];
      if (filters.availableAt && /^\d{2}:\d{2}$/.test(filters.availableAt)) {
        const [h, m] = filters.availableAt.split(':').map(Number);
        const minutes = h * 60 + m;
        const toMinutes = (hms: string) => {
          const [hh, mm] = hms.split(':').map(Number);
          return hh * 60 + mm;
        };
        matching = matching.filter((row) => toMinutes(row.start_time) <= minutes && minutes < toMinutes(row.end_time));
      }
      const openVenueIds = [...new Set(matching.map((row) => row.venue_id))];
      query = query.in('id', openVenueIds.length > 0 ? openVenueIds : ['00000000-0000-0000-0000-000000000000']);
    }
  }

  const amenityIds = (filters.amenityIds ?? []).filter((id) => UUID_RE.test(id));
  if (amenityIds.length > 0) {
    const { data: amenityRows, error: amenityError } = await supabase
      .from('venue_amenities')
      .select('venue_id, amenity_id')
      .in('amenity_id', amenityIds);
    if (amenityError) throw amenityError;

    // AND semantics: a venue must have every selected amenity, not just one.
    const countByVenue = new Map<string, number>();
    for (const row of amenityRows ?? []) {
      countByVenue.set(row.venue_id, (countByVenue.get(row.venue_id) ?? 0) + 1);
    }
    const matchingIds = Array.from(countByVenue.entries())
      .filter(([, count]) => count === amenityIds.length)
      .map(([id]) => id);
    query = query.in('id', matchingIds.length > 0 ? matchingIds : ['00000000-0000-0000-0000-000000000000']);
  }

  switch (filters.sort) {
    case 'price_asc':
      query = query.order('starting_price', { ascending: true, nullsFirst: false });
      break;
    case 'price_desc':
      query = query.order('starting_price', { ascending: false, nullsFirst: false });
      break;
    case 'rating':
      query = query.order('average_rating', { ascending: false });
      break;
    case 'recommended':
    default:
      query = query.order('average_rating', { ascending: false }).order('review_count', { ascending: false });
  }

  const { data, error } = await query.limit(50);
  if (error) throw error;
  const venues = data ?? [];
  if (venues.length === 0) return [];

  // Live open/closed badge — one batched hours query for the whole page
  // of results, same "courts-first-then-children" shape as the web's
  // toVenueCardData, not a per-card query.
  const { data: hoursRows, error: hoursError } = await supabase
    .from('venue_operating_hours')
    .select('*')
    .in(
      'venue_id',
      venues.map((v) => v.id)
    );
  if (hoursError) throw hoursError;
  const hoursByVenue = new Map<string, VenueOperatingHours[]>();
  for (const row of hoursRows ?? []) {
    const list = hoursByVenue.get(row.venue_id) ?? [];
    list.push(row);
    hoursByVenue.set(row.venue_id, list);
  }

  return venues.map((venue) => ({
    ...venue,
    openStatus: computeOpenStatus(hoursByVenue.get(venue.id) ?? [], venue.timezone),
  }));
}

export async function listAmenities(): Promise<Amenity[]> {
  const { data, error } = await supabase.from('amenities').select('*').order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** The live set of surface_type values in use, case-folded to the first
 * spelling seen — mirrors the web's listSurfaceTypes() dedup rule so the
 * filter chips read the same on both platforms. */
export async function listSurfaceTypes(): Promise<string[]> {
  const { data, error } = await supabase.from('courts').select('surface_type').not('surface_type', 'is', null);
  if (error) throw error;
  const byLowercase = new Map<string, string>();
  for (const row of data ?? []) {
    const value = (row.surface_type ?? '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (!byLowercase.has(key)) byLowercase.set(key, value);
  }
  return Array.from(byLowercase.values()).sort((a, b) => a.localeCompare(b));
}

export type AmenityAvailability = { amenity: Amenity; available: boolean };

export type VenueDetail = VenueMarketplaceRow & {
  courts: Court[];
  /** The FULL amenity catalog, each flagged available/not — matching the
   * web app's venue page, which shows what a venue is missing as well as
   * what it has, not just a filtered list of what it has. */
  amenities: AmenityAvailability[];
  hours: VenueOperatingHours[];
  /** First venue-level image, else first court image — same "cover" rule
   * as the web. */
  imagePaths: string[];
};

export async function getVenueDetail(venueId: string): Promise<VenueDetail | null> {
  const [venueResult, courtsResult, allAmenitiesResult, amenityLinksResult, hoursResult, imagesResult] =
    await Promise.all([
      supabase.from('venue_marketplace').select('*').eq('id', venueId).maybeSingle(),
      supabase
        .from('courts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('status', 'active')
        .order('hourly_price', { ascending: true }),
      supabase.from('amenities').select('*').order('name', { ascending: true }),
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
  if (allAmenitiesResult.error) throw allAmenitiesResult.error;
  if (amenityLinksResult.error) throw amenityLinksResult.error;
  if (hoursResult.error) throw hoursResult.error;
  if (imagesResult.error) throw imagesResult.error;

  const availableIds = new Set((amenityLinksResult.data ?? []).map((row) => row.amenity_id));
  const amenities: AmenityAvailability[] = (allAmenitiesResult.data ?? []).map((amenity) => ({
    amenity,
    available: availableIds.has(amenity.id),
  }));

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

/** A maps: URL that opens the platform's native Maps app to this venue —
 * no react-native-maps dependency (and its native rebuild) required for
 * "get directions" to work. `https://maps.apple.com` and
 * `https://maps.google.com` both redirect correctly on the OTHER
 * platform too, so a single universal link works everywhere, including
 * the web target. */
export function directionsUrl(venue: Pick<VenueMarketplaceRow, 'latitude' | 'longitude' | 'name'>): string | null {
  if (venue.latitude === null || venue.longitude === null) return null;
  const label = encodeURIComponent(venue.name);
  return `https://maps.apple.com/?daddr=${venue.latitude},${venue.longitude}&q=${label}`;
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
