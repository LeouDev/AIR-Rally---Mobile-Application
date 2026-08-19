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

/** Change-password-while-signed-in — same auth.updateUser() call the
 * web's ChangePasswordForm makes, just without the server-action layer
 * mobile doesn't have. */
export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
