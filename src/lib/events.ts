import type { CommunityEvent, EventAttendeeStatus, PublicProfile } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

type EventVenue = { id: string; name: string; city: string | null };

export type EventWithDetails = CommunityEvent & {
  creator: PublicProfile | null;
  venue: EventVenue | null;
  attendeeCount: number;
  isFull: boolean;
};

/** Upcoming, soonest first. participant_count is trigger-maintained, so
 * the seated count comes free with the row — no per-event query needed. */
export async function listUpcomingEvents(limit = 20): Promise<EventWithDetails[]> {
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'published')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!events || events.length === 0) return [];

  const creatorIds = Array.from(new Set(events.map((e) => e.creator_id)));
  const venueIds = Array.from(new Set(events.map((e) => e.venue_id).filter((id): id is string => id !== null)));

  const [creatorsResult, venuesResult] = await Promise.all([
    supabase.from('public_profiles').select('*').in('id', creatorIds),
    venueIds.length > 0
      ? supabase.from('venues').select('id, name, city').in('id', venueIds)
      : Promise.resolve({ data: [] as EventVenue[], error: null }),
  ]);
  if (creatorsResult.error) throw creatorsResult.error;
  if (venuesResult.error) throw venuesResult.error;

  const creatorsById = new Map((creatorsResult.data ?? []).map((c) => [c.id, c]));
  const venuesById = new Map(((venuesResult.data ?? []) as EventVenue[]).map((v) => [v.id, v]));

  return events.map((event) => ({
    ...event,
    creator: creatorsById.get(event.creator_id) ?? null,
    venue: event.venue_id ? (venuesById.get(event.venue_id) ?? null) : null,
    attendeeCount: event.participant_count,
    isFull: event.max_players !== null && event.participant_count >= event.max_players,
  }));
}

export type CreateEventInput = {
  title: string;
  description?: string | null;
  startTime: string;
  endTime?: string | null;
  venueId?: string | null;
  courtId?: string | null;
  bookingId?: string | null;
  maxPlayers?: number | null;
};

export async function createEvent(creatorId: string, values: CreateEventInput): Promise<CommunityEvent> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      creator_id: creatorId,
      title: values.title,
      description: values.description ?? null,
      start_time: values.startTime,
      end_time: values.endTime ?? null,
      event_type: 'open_play',
      skill_level: null,
      venue_id: values.venueId ?? null,
      club_id: null,
      court_id: values.courtId ?? null,
      booking_id: values.bookingId ?? null,
      max_players: values.maxPlayers ?? null,
      price_amount: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function cancelEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('events').update({ status: 'cancelled' }).eq('id', eventId);
  if (error) throw error;
}

/** Whether the caller lands a seat or the waitlist is decided by a
 * database trigger under a row lock — never here, because two concurrent
 * joins racing in application code could both see a free seat. Idempotent:
 * joining twice re-activates the existing row rather than erroring. */
export async function joinEvent(userId: string, eventId: string): Promise<EventAttendeeStatus> {
  const { data, error } = await supabase
    .from('event_attendees')
    .insert({ event_id: eventId, user_id: userId, status: 'joined' })
    .select('status')
    .single();

  if (error) {
    if (error.code !== '23505') throw error;
    const { data: updated, error: updateError } = await supabase
      .from('event_attendees')
      .update({ status: 'joined' })
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .select('status')
      .single();
    if (updateError) throw updateError;
    return updated.status;
  }
  return data.status;
}

/** A status transition, not a delete — the row has to survive so the
 * database's own waitlist-promotion logic can see a seat was vacated. */
export async function leaveEvent(userId: string, eventId: string): Promise<void> {
  const { error } = await supabase
    .from('event_attendees')
    .update({ status: 'cancelled' })
    .eq('event_id', eventId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function listAttendingEventIds(userId: string, eventIds: string[]): Promise<string[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase
    .from('event_attendees')
    .select('event_id')
    .eq('user_id', userId)
    .in('event_id', eventIds)
    .in('status', ['joined', 'waitlisted']);
  if (error) throw error;
  return (data ?? []).map((row) => row.event_id);
}

export type HostableBooking = {
  bookingId: string;
  courtId: string;
  courtName: string;
  venueName: string;
  startTime: string;
  endTime: string;
  existingEventId: string | null;
};

/** Only a caller's own upcoming (pending/confirmed) bookings can host a
 * game — the events RLS policy requires a live booking of the creator's
 * own before an event may claim a court. */
export async function listHostableBookings(userId: string): Promise<HostableBooking[]> {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, court_id, start_time, end_time, status, courts(name, venues(name))')
    .eq('user_id', userId)
    .in('status', ['pending', 'confirmed'])
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(50);
  if (error) throw error;
  if (!bookings || bookings.length === 0) return [];

  const rows = bookings as unknown as {
    id: string;
    court_id: string;
    start_time: string;
    end_time: string;
    courts: { name: string; venues: { name: string } | null } | null;
  }[];

  const { data: events } = await supabase
    .from('events')
    .select('id, booking_id')
    .in(
      'booking_id',
      rows.map((b) => b.id)
    )
    .neq('status', 'cancelled');
  const eventByBooking = new Map((events ?? []).map((e) => [e.booking_id, e.id]));

  return rows.map((booking) => ({
    bookingId: booking.id,
    courtId: booking.court_id,
    courtName: booking.courts?.name ?? 'Court',
    venueName: booking.courts?.venues?.name ?? 'Venue',
    startTime: booking.start_time,
    endTime: booking.end_time,
    existingEventId: eventByBooking.get(booking.id) ?? null,
  }));
}
