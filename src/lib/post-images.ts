import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

export const POST_IMAGES_BUCKET = 'post-images';
/** Enforced here and by the posts_image_paths_max_5 CHECK — matches web's MAX_POST_IMAGES. */
export const MAX_POST_IMAGES = 5;
export const ALLOWED_POST_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Matches the post-images bucket's own file_size_limit (5 MB). */
export const MAX_POST_IMAGE_BYTES = 5 * 1024 * 1024;

export type PickedPostImage = { uri: string; mimeType: string; fileName: string | null };

/** Opens the native photo library for up to `remaining` images. Returns
 * an empty array if the user cancelled or permission was denied — never
 * throws for either, same posture as pickAvatarImage(). */
export async function pickPostImages(remaining: number): Promise<PickedPostImage[]> {
  if (remaining <= 0) return [];
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 0.8,
  });
  if (result.canceled) return [];

  return result.assets.map((asset) => ({
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    fileName: asset.fileName ?? null,
  }));
}

export type PostImageUploadResult = { paths: string[]; errors: string[] };

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Uploads composer images to post-images/<user_id>/<random>.<ext> — same
 * bucket and path convention as the web's uploadPostImages(). Partial
 * success is deliberate: a post with 4 of 5 photos still beats losing
 * the whole post, so failures are collected and returned rather than
 * thrown.
 *
 * Reads bytes via expo-file-system's File.arrayBuffer(), not
 * fetch(uri).then(r => r.blob()) — see uploadAvatar() in lib/avatars.ts
 * for why: React Native's fetch/Blob doesn't reliably carry real binary
 * data for a local file:// URI, so a blob upload can silently write a
 * corrupt or empty object with no thrown error.
 */
export async function uploadPostImages(userId: string, images: PickedPostImage[]): Promise<PostImageUploadResult> {
  const paths: string[] = [];
  const errors: string[] = [];

  for (const image of images.slice(0, MAX_POST_IMAGES)) {
    const label = image.fileName ?? 'Photo';
    if (!ALLOWED_POST_IMAGE_TYPES.includes(image.mimeType)) {
      errors.push(`${label}: only JPEG, PNG, and WebP images are supported.`);
      continue;
    }

    try {
      const bytes = await new File(image.uri).arrayBuffer();
      if (bytes.byteLength > MAX_POST_IMAGE_BYTES) {
        errors.push(`${label}: images must be 5 MB or smaller.`);
        continue;
      }
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extensionFor(image.mimeType)}`;
      const { error } = await supabase.storage
        .from(POST_IMAGES_BUCKET)
        .upload(path, bytes, { contentType: image.mimeType, upsert: false });
      if (error) throw error;
      paths.push(path);
    } catch {
      errors.push(`${label}: upload failed.`);
    }
  }

  return { paths, errors };
}

export function postImagePublicUrl(path: string): string {
  return supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}
