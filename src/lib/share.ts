import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
// This dependency exists solely for shareToInstagramStory() below — its
// shareSingle()/Social.InstagramStories is the only way to pre-load
// Instagram's Story composer, and RN core has no equivalent. It is NOT
// what shareCard() uses, on either platform: iOS already gets the
// combined image+text+link payload from RN core's own Share.share()
// (see the block comment below), and the Android gap described there is
// still unfixed — installing this package didn't close it. Don't read
// its presence as "Android sharing is covered now."
import RNShare, { Social } from 'react-native-share';

/**
 * Sharing a captured ShareCardFrame image, with the object's own URL and
 * a line of text alongside it wherever the platform allows.
 *
 * Why this isn't one call to expo-sharing: `shareAsync()` takes a single
 * local file URI and its options are `{ mimeType, UTI, dialogTitle,
 * anchor }` — there is no text or url field, so it structurally cannot
 * carry a link. That's why every share this app sent before this
 * function existed arrived as a picture with no way to tap through to
 * anything.
 *
 * iOS CAN do it with what's already installed. React Native's own
 * `Share.share({ message, url })` reaches RCTActionSheetManager, which
 * builds an activity-items array — the message NSString AND the file://
 * NSURL both go in, then straight to UIActivityViewController. So the
 * recipient gets the branded image and the tappable link in one payload,
 * no extra dependency.
 *
 * ANDROID CANNOT, and this remains an open gap — installing
 * `react-native-share` (below, for Instagram Stories) did NOT close it,
 * because nothing in this file calls it from the Android branch:
 *   - RN's Share.js drops `url` before it reaches native — it forwards
 *     only `{ title, message }`.
 *   - ShareModule.kt hardcodes `setTypeAndNormalize("text/plain")` and
 *     sets only EXTRA_SUBJECT/EXTRA_TEXT. No EXTRA_STREAM, so no image
 *     can travel that path at all.
 * Android natively supports ACTION_SEND carrying EXTRA_STREAM and
 * EXTRA_TEXT together; neither installed library exposes it from this
 * function. So Android keeps the branded image via expo-sharing and loses
 * the link — the founder's call, on the grounds that the card is what
 * makes a share worth making and iOS is the launch platform.
 * `react-native-share`'s generic `RNShare.open({ url, message })` COULD
 * carry both on Android too (unlike RN core's Share.js, it doesn't drop
 * `url`), so it's a viable fix later — but that's unbuilt work, not
 * something installing the dependency already gives you. TODO: when
 * someone picks this up, replace the Android branch below with
 * `RNShare.open({ url: fileUri, message: messageWithUrl })` and verify on
 * a real Android device/emulator — untested on this machine, so it
 * wasn't done as part of adding the dependency.
 */
export async function shareCard({
  fileUri,
  message,
  url,
}: {
  /** A local file:// URI from captureRef — the branded card. Omit it
   * when the capture failed: the share then degrades to text (and the
   * link, if there is one) rather than to nothing. */
  fileUri?: string;
  /** The line of text that travels with it. Becomes the entire share
   * when there's no image to attach. */
  message: string;
  /** The object's public web URL, when it has one. Omitted deliberately
   * for objects whose web page isn't publicly viewable — a link that
   * lands on a login wall is worse than no link. */
  url?: string;
}): Promise<void> {
  // The message carries the URL too, not just the `url` field: on iOS
  // the two arrive as separate activity items and some targets take only
  // one of them, and the Android/plain-text fallback below has no `url`
  // field at all to fall back on.
  const messageWithUrl = url ? `${message}\n\n${url}` : message;

  if (fileUri) {
    if (Platform.OS === 'ios') {
      try {
        await Share.share({ message: messageWithUrl, url: fileUri });
        return;
      } catch {
        // Sheet dismissed or unavailable — fall through rather than
        // leaving the share button silently doing nothing.
      }
    } else {
      // Android: image only, per the block comment above.
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'image/png',
            dialogTitle: 'Share to AIR/Rally',
            UTI: 'public.png',
          });
          return;
        }
      } catch {
        // Fall through to text.
      }
    }
  }

  try {
    await Share.share({ message: messageWithUrl });
  } catch {
    // Share sheet dismissed or unavailable — not an error.
  }
}

/** The Meta App ID Instagram Stories requires — mandatory since a January
 * 2023 policy change; omitting it makes Instagram show the user "The app
 * you shared from doesn't currently support sharing to Stories." Same
 * no-op-when-unconfigured shape as EXPO_PUBLIC_SENTRY_DSN (src/lib/sentry.ts):
 * a build without one degrades to "the button doesn't appear" rather than
 * a broken tap. Unset as of this writing — needs a real Meta Developer
 * app (free, self-serve) registered before this does anything. */
const META_APP_ID = process.env.EXPO_PUBLIC_META_APP_ID;

export function instagramStoriesAvailable(): boolean {
  return Boolean(META_APP_ID);
}

export type ShareResult = { status: 'success' } | { status: 'unavailable' } | { status: 'error'; message: string };

/**
 * Hands a branded card straight to Instagram's Stories composer, pre-
 * loaded on the canvas — instagram-stories://share plus the iOS pasteboard,
 * wrapped by react-native-share's shareSingle(). This only pre-fills the
 * composer: Instagram still requires the user to tap through and post it
 * themselves, the same as every other destination in this app. There is
 * no auto-publish path anywhere in this mechanism.
 *
 * linkUrl becomes the Story's swipe-up/link sticker when Instagram
 * attaches one — the same object URL shareCard() sends everywhere else,
 * so a Story built from this card can still lead back to the app.
 */
export async function shareToInstagramStory({ fileUri, url }: { fileUri: string; url?: string }): Promise<ShareResult> {
  if (!META_APP_ID) return { status: 'unavailable' };
  try {
    await RNShare.shareSingle({
      social: Social.InstagramStories,
      appId: META_APP_ID,
      backgroundImage: fileUri,
      linkUrl: url,
    });
    return { status: 'success' };
  } catch (error) {
    // A cancelled/dismissed composer also rejects here — react-native-share
    // doesn't distinguish "user backed out" from a real failure, so this
    // reads as best-effort rather than a hard error surfaced to the user.
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not open Instagram.' };
  }
}
