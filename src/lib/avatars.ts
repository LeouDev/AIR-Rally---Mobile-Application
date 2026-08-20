import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

const AVATAR_BUCKET = 'avatars';

/** Fixed, extension-less path per user — matches the web's
 * buildAvatarStoragePath() exactly (see supabase/migrations/
 * 20260810000022_avatars_storage.sql): a re-upload overwrites in place
 * via upsert rather than accumulating orphaned files. */
function avatarStoragePath(userId: string): string {
  return `${userId}/avatar`;
}

export function getAvatarPublicUrl(userId: string): string {
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(avatarStoragePath(userId)).data.publicUrl;
}

export type PickedAvatar = { uri: string; mimeType: string };

/** Opens the native photo library with square cropping built into the OS
 * picker UI (allowsEditing + aspect) — no separate crop library needed,
 * unlike the web's react-easy-crop dialog. Returns null if the user
 * cancelled or permission was denied. */
export async function pickAvatarImage(): Promise<PickedAvatar | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' };
}

/** Uploads directly to Storage — RLS already scopes this to the caller's
 * own `<user_id>/` folder (same migration as above). Returns a
 * cache-busted public URL, since the storage path never changes on
 * re-upload and a stale cached image would otherwise stick around.
 *
 * Reads the picked file's bytes via expo-file-system's File.arrayBuffer(),
 * not fetch(uri).then(r => r.blob()) — React Native's fetch/Blob doesn't
 * reliably carry real binary data for a local file:// URI (a long-standing
 * RN gotcha; Supabase's own React Native docs call it out), so a blob
 * upload can silently write a corrupt or empty object: no thrown error,
 * upload() reports success, and the resulting image just never renders. */
export async function uploadAvatar(userId: string, image: PickedAvatar): Promise<string> {
  const bytes = await new File(image.uri).arrayBuffer();
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(avatarStoragePath(userId), bytes, { contentType: image.mimeType, upsert: true });
  if (error) throw error;
  return `${getAvatarPublicUrl(userId)}?v=${Date.now()}`;
}
