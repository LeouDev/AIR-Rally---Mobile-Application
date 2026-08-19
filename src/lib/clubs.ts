import type { Club, ClubMember, ClubMemberRole, PublicProfile } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type ClubMemberWithProfile = ClubMember & { profile: PublicProfile | null };
export type ClubWithViewerState = Club & {
  viewerRole: ClubMemberRole | null;
  viewerPending: boolean;
};

/** RLS already hides private clubs the caller isn't a member of — no
 * visibility filter needed here, the database is the boundary. */
export async function listDiscoverableClubs(limit = 24): Promise<Club[]> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('status', 'active')
    .order('member_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function searchClubs(query: string, limit = 8): Promise<Club[]> {
  const term = query.trim();
  if (!term) return [];
  const escaped = term.replace(/([%_\\])/g, '\\$1');
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('status', 'active')
    .ilike('name', `%${escaped}%`)
    .order('member_count', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Every club the given user actively belongs to, whatever their role. */
export async function listClubsForUser(userId: string): Promise<Club[]> {
  const { data: memberships, error: membershipsError } = await supabase
    .from('club_members')
    .select('club_id')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (membershipsError) throw membershipsError;

  const clubIds = (memberships ?? []).map((m) => m.club_id);
  if (clubIds.length === 0) return [];

  const { data, error } = await supabase.from('clubs').select('*').in('id', clubIds).order('name');
  if (error) throw error;
  return data ?? [];
}

/** One club plus the viewer's own relationship to it. Null covers "doesn't
 * exist" and "private to this viewer" identically — same posture as venue
 * detail's own not-found handling. */
export async function getClubForViewer(clubId: string, viewerId: string | null): Promise<ClubWithViewerState | null> {
  const { data: club, error } = await supabase.from('clubs').select('*').eq('id', clubId).maybeSingle();
  if (error) throw error;
  if (!club) return null;
  if (!viewerId) return { ...club, viewerRole: null, viewerPending: false };

  const { data: membership, error: membershipError } = await supabase
    .from('club_members')
    .select('role, status')
    .eq('club_id', clubId)
    .eq('user_id', viewerId)
    .maybeSingle();
  if (membershipError) throw membershipError;

  return {
    ...club,
    viewerRole: membership?.status === 'active' ? membership.role : null,
    viewerPending: membership?.status === 'pending',
  };
}

export async function listClubMembers(clubId: string): Promise<ClubMemberWithProfile[]> {
  const { data: members, error } = await supabase
    .from('club_members')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!members || members.length === 0) return [];

  const userIds = Array.from(new Set(members.map((m) => m.user_id)));
  const { data: profiles, error: profilesError } = await supabase.from('public_profiles').select('*').in('id', userIds);
  if (profilesError) throw profilesError;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  return members.map((member) => ({ ...member, profile: profileById.get(member.user_id) ?? null }));
}

export type CreateClubInput = {
  name: string;
  description?: string | null;
  location?: string | null;
  skillLevel: Club['skill_level'];
  clubType: Club['club_type'];
  visibility: Club['visibility'];
};

/** Requires no platform role beyond a signed-in account — a player can own
 * a club. The owner's own membership row is inserted by a database
 * trigger, not here, so ownership can never be half-written. */
export async function createClub(ownerId: string, values: CreateClubInput): Promise<Club> {
  const { data, error } = await supabase
    .from('clubs')
    .insert({
      owner_id: ownerId,
      name: values.name,
      description: values.description ?? null,
      location: values.location ?? null,
      image_url: null,
      skill_level: values.skillLevel,
      club_type: values.clubType,
      visibility: values.visibility,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Whether this lands as an active member or a pending request is decided
 * entirely by a database trigger from the club's own visibility — nothing
 * the client passes can influence that. Idempotent. */
export async function requestClubMembership(clubId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('club_members').insert({ club_id: clubId, user_id: userId });
  if (error && error.code !== '23505') throw error;
}

export async function leaveClub(clubId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId);
  if (error) throw error;
}
