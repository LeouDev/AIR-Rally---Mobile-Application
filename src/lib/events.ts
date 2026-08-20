import type { CommunityEvent, EventAttendeeStatus, PublicProfile } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

type EventVenue = { id: string; name: string; city: string | null };

export type EventWithDetails = CommunityEvent & {
  creator: PublicProfile | null;
  venue: EventVenue | null;
  attendeeCount: number;
  isFull: boolean;
};

export type EmbeddedEvent = {
  id: string;
  title: string;
  start_time: string;
  venue: EventVenue | null;
  attendeeCount: number;
  max_players: number | null;
  isFull: boolean;
  creator_id: string;
};

/** Batched lookup for posts.event_id — the "share this game" embedded
 * card in a COURT/Side post, keyed by an arbitrary id set rather than
 * "upcoming only" (a shared match's card should still render after the
 * game has happened). Mirrors the web's listEmbeddedEvents. */
export async function listEmbeddedEvents(eventIds: string[]): Promise<Map<string, EmbeddedEvent>> {
  if (eventIds.length === 0) return new Map();
  const { data: events, error } = await supabase.from('events').select('*').in('id', eventIds);
  if (error) throw error;
  if (!events || events.length === 0) return new Map();

  const venueIds = Array.from(new Set(events.map((e) => e.venue_id).filter((id): id is string => id !== null)));
  const { data: venues, error: venuesError } =
    venueIds.length > 0
      ? await supabase.from('venues').select('id, name, city').in('id', venueIds)
      : { data: [] as EventVenue[], error: null };
  if (venuesError) throw venuesError;
  const venuesById = new Map((venues ?? []).map((v) => [v.id, v]));

  return new Map(
    events.map((event) => [
      event.id,
      {
        id: event.id,
        title: event.title,
        start_time: event.start_time,
        venue: event.venue_id ? (venuesById.get(event.venue_id) ?? null) : null,
        attendeeCount: event.participant_count,
        max_players: event.max_players,
        isFull: event.max_players !== null && event.participant_count >= event.max_players,
        creator_id: event.creator_id,
      },
    ])
  );
}

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

export type EventDetail = CommunityEvent & {
  creator: PublicProfile | null;
  venue: EventVenue | null;
  attendees: PublicProfile[];
  isFull: boolean;
};

/** The Game page: the event row, its organiser, venue, and the roster of
 * everyone actually seated ('joined' only — a waitlisted row isn't
 * "playing" yet). Mirrors the web's event detail page query shape. */
export async function getEventDetail(eventId: string): Promise<EventDetail | null> {
  const { data: event, error } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
  if (error) throw error;
  if (!event) return null;

  const [creatorResult, venueResult, attendeeRowsResult] = await Promise.all([
    supabase.from('public_profiles').select('*').eq('id', event.creator_id).maybeSingle(),
    event.venue_id
      ? supabase.from('venues').select('id, name, city').eq('id', event.venue_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('event_attendees').select('user_id').eq('event_id', event.id).eq('status', 'joined'),
  ]);
  if (creatorResult.error) throw creatorResult.error;
  if (venueResult.error) throw venueResult.error;
  if (attendeeRowsResult.error) throw attendeeRowsResult.error;

  const attendeeIds = (attendeeRowsResult.data ?? []).map((row) => row.user_id);
  const { data: attendees, error: attendeesError } =
    attendeeIds.length > 0
      ? await supabase.from('public_profiles').select('*').in('id', attendeeIds)
      : { data: [] as PublicProfile[], error: null };
  if (attendeesError) throw attendeesError;

  return {
    ...event,
    creator: creatorResult.data,
    venue: venueResult.data as EventVenue | null,
    attendees: attendees ?? [],
    isFull: event.max_players !== null && attendeeIds.length >= event.max_players,
  };
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
  /** Integer minor units — display only, for the share calculator. Never
   * charged through this path; the organiser has already paid the venue
   * separately (or this is a court-less event, where it stays 0). */
  priceAmount?: number;
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
      price_amount: values.priceAmount ?? 0,
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

/**
 * The caller's exact status per event — batched, one query for a whole
 * set of ids. A plain "attending?" boolean isn't enough once a join can
 * be pending: Join / Requested / Joined / Waitlisted all render
 * differently. Cancelled rows are omitted, same as "not attending".
 */
export async function listMyEventStatuses(userId: string, eventIds: string[]): Promise<Map<string, EventAttendeeStatus>> {
  if (eventIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('event_attendees')
    .select('event_id, status')
    .eq('user_id', userId)
    .in('event_id', eventIds)
    .neq('status', 'cancelled');
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.event_id, row.status]));
}

export type PendingJoinRequest = {
  userId: string;
  profile: PublicProfile | null;
  requestedAt: string;
};

/** Requests awaiting the creator's decision. RLS already restricts pending
 * rows to the requester and the event's own creator. */
export async function listPendingJoinRequests(eventId: string): Promise<PendingJoinRequest[]> {
  const { data, error } = await supabase
    .from('event_attendees')
    .select('user_id, created_at')
    .eq('event_id', eventId)
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const userIds = data.map((row) => row.user_id);
  const { data: profiles, error: profilesError } = await supabase.from('public_profiles').select('*').in('id', userIds);
  if (profilesError) throw profilesError;
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return data.map((row) => ({
    userId: row.user_id,
    profile: profileById.get(row.user_id) ?? null,
    requestedAt: row.created_at,
  }));
}

/** Approves a pending request into a seat — enforce_event_capacity() still
 * decides joined vs waitlisted, same as an ordinary join. RLS restricts
 * this to the event's actual creator. */
export async function approveEventJoin(eventId: string, userId: string): Promise<EventAttendeeStatus> {
  const { data, error } = await supabase
    .from('event_attendees')
    .update({ status: 'joined' })
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .select('status')
    .single();
  if (error) throw error;
  return data.status;
}

/** Declines a pending request — the same status a leave uses. */
export async function rejectEventJoin(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('event_attendees')
    .update({ status: 'cancelled' })
    .eq('event_id', eventId)
    .eq('user_id', userId);
  if (error) throw error;
}

export type HostableBooking = {
  bookingId: string;
  courtId: string;
  courtName: string;
  venueName: string;
  startTime: string;
  endTime: string;
  priceAmount: number;
  currency: string;
  existingEventId: string | null;
};

/** Only a caller's own upcoming (pending/confirmed) bookings can host a
 * game — the events RLS policy requires a live booking of the creator's
 * own before an event may claim a court. */
export async function listHostableBookings(userId: string): Promise<HostableBooking[]> {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, court_id, start_time, end_time, status, price_amount, currency, courts(name, venues(name))')
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
    price_amount: number;
    currency: string;
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
    priceAmount: booking.price_amount,
    currency: booking.currency,
    existingEventId: eventByBooking.get(booking.id) ?? null,
  }));
}

/**
 * Turns a booking the caller already holds into an Open Play game and
 * invites their chosen playmates — the client-side mirror of the web's
 * createOpenPlayForBookingAction. Money is deliberately absent past
 * copying the booking's own price_amount onto the event for the share
 * calculator: the organiser has already paid (or is paying) for the
 * whole booking through the ordinary checkout, and invited players are
 * NOT auto-enrolled — invite_event_players() only notifies them, each
 * joins with their own tap.
 */
export async function createOpenPlayForBooking(
  userId: string,
  values: { bookingId: string; playerIds: string[]; title?: string }
): Promise<{ eventId: string; invited: number }> {
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, user_id, court_id, start_time, end_time, status, price_amount, courts(name, venues(name))')
    .eq('id', values.bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking || booking.user_id !== userId) throw new Error("We couldn't find that booking.");
  if (booking.status === 'cancelled') throw new Error('That booking was cancelled.');

  const row = booking as unknown as {
    id: string;
    court_id: string;
    start_time: string;
    end_time: string;
    price_amount: number;
    courts: { name: string; venues: { name: string } | null } | null;
  };
  const venueName = row.courts?.venues?.name ?? 'the venue';

  const event = await createEvent(userId, {
    title: values.title ?? `Open Play at ${venueName}`,
    startTime: row.start_time,
    endTime: row.end_time,
    courtId: row.court_id,
    bookingId: row.id,
    // Party size = organiser + invited players. Others can still join up
    // to this cap; the organiser can be more generous by inviting more.
    maxPlayers: Math.max(values.playerIds.length + 1, 2),
    priceAmount: row.price_amount,
  });

  // The organiser is on their own roster — they're playing too, and the
  // share calculator divides by everyone including them.
  await joinEvent(userId, event.id);

  let invited = 0;
  if (values.playerIds.length > 0) {
    const { data, error } = await supabase.rpc('invite_event_players', {
      p_event_id: event.id,
      p_user_ids: values.playerIds,
    });
    if (error) throw error;
    invited = data ?? 0;
  }

  return { eventId: event.id, invited };
}
