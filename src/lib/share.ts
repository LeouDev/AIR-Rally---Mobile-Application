import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

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
 * ANDROID CANNOT, and this is the gap `react-native-share` is meant to
 * close in the next native build:
 *   - RN's Share.js drops `url` before it reaches native — it forwards
 *     only `{ title, message }`.
 *   - ShareModule.kt hardcodes `setTypeAndNormalize("text/plain")` and
 *     sets only EXTRA_SUBJECT/EXTRA_TEXT. No EXTRA_STREAM, so no image
 *     can travel that path at all.
 * Android natively supports ACTION_SEND carrying EXTRA_STREAM and
 * EXTRA_TEXT together; neither installed library exposes it. So Android
 * keeps the branded image via expo-sharing and loses the link — the
 * founder's call, on the grounds that the card is what makes a share
 * worth making and iOS is the launch platform. When react-native-share
 * lands, THIS is the branch to replace: give Android the same
 * image+text+link payload the iOS branch above already sends.
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
