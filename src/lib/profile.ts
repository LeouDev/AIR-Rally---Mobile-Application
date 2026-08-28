import type { Profile } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type UpdateProfileValues = {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  avatarUrl?: string;
};

/** Same phone shape the web's updateProfileSchema accepts — digits,
 * spaces, +()- , 7–20 characters. Empty string is valid (clears the
 * field). */
export const PHONE_REGEX = /^[0-9+()\-.\s]{7,20}$/;

export async function updateProfile(userId: string, values: UpdateProfileValues): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      first_name: values.firstName.trim(),
      last_name: values.lastName.trim(),
      display_name: values.displayName.trim(),
      phone: values.phone.trim() || null,
      ...(values.avatarUrl ? { avatar_url: values.avatarUrl } : {}),
    })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmailNotificationPreference(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ email_notifications_enabled: enabled }).eq('id', userId);
  if (error) throw error;
}

/** Whether this player has ever tapped "Play anyway" on the Play
 * doorway's unbooked-rating-freeze dialog. A read failure returns
 * false — the safe default, since it only re-shows a dialog rather
 * than silently skipping a warning the player hasn't actually seen. */
export async function getUnbookedPlayAcknowledged(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('unbooked_play_ack_at').eq('id', userId).single();
  if (error || !data) return false;
  return data.unbooked_play_ack_at !== null;
}

/** Best-effort — the caller (play.tsx's confirmBeforeUnbookedMatch)
 * resolves the player into their match on the strength of the tap
 * alone, before this even starts. A failed write costs a repeated
 * dialog on a future session; it must never block or unwind a match
 * that's already been approved. */
export async function acknowledgeUnbookedPlay(userId: string): Promise<void> {
  try {
    await supabase.from('profiles').update({ unbooked_play_ack_at: new Date().toISOString() }).eq('id', userId);
  } catch {
    // Swallowed deliberately — see above.
  }
}

/** Change-password-while-signed-in — same auth.updateUser() call the
 * web's ChangePasswordForm makes, just without the server-action layer
 * mobile doesn't have. */
export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
