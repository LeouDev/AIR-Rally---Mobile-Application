import { Image } from 'expo-image';

/**
 * The official multi-colour Google "G", inlined as an SVG data URI.
 *
 * Google's Sign in with Google branding guidelines
 * (developers.google.com/identity/branding-guidelines) are explicit that
 * a custom button must carry the standard colour mark, and name two
 * things this app was doing before as prohibited: monochrome versions,
 * and drawing your own icon. The previous button used FontAwesome's
 * generic single-colour `google` glyph, which is both.
 *
 * Rendered through expo-image rather than react-native-svg on purpose.
 * react-native-svg is not a dependency and was not in the RC, so adding
 * it would mean a native rebuild — one of only two iOS builds left.
 * expo-image WAS in the RC and links SDWebImageSVGCoder on iOS
 * (see its podspec), so it renders SVG natively in the binary already on
 * the founder's phone. A data URI also means no new asset file: the mark
 * travels inside the JS bundle, which is what makes this shippable over
 * the air.
 *
 * The guidelines forbid recolouring or resizing the mark relative to
 * itself, so this takes only an overall `size` and keeps the artwork's
 * own proportions and colours untouched.
 */
const GOOGLE_G_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZmlsbD0iI0VBNDMzNSIgZD0iTTI0IDkuNWMzLjU0IDAgNi43MSAxLjIyIDkuMjEgMy42bDYuODUtNi44NUMzNS45IDIuMzggMzAuNDcgMCAyNCAwIDE0LjYyIDAgNi41MSA1LjM4IDIuNTYgMTMuMjJsNy45OCA2LjE5QzEyLjQzIDEzLjcyIDE3Ljc0IDkuNSAyNCA5LjV6Ii8+PHBhdGggZmlsbD0iIzQyODVGNCIgZD0iTTQ2Ljk4IDI0LjU1YzAtMS41Ny0uMTUtMy4wOS0uMzgtNC41NUgyNHY5LjAyaDEyLjk0Yy0uNTggMi45Ni0yLjI2IDUuNDgtNC43OCA3LjE4bDcuNzMgNmM0LjUxLTQuMTggNy4wOS0xMC4zNiA3LjA5LTE3LjY1eiIvPjxwYXRoIGZpbGw9IiNGQkJDMDUiIGQ9Ik0xMC41MyAyOC41OWMtLjQ4LTEuNDUtLjc2LTIuOTktLjc2LTQuNTlzLjI3LTMuMTQuNzYtNC41OWwtNy45OC02LjE5Qy45MiAxNi40NiAwIDIwLjEyIDAgMjRjMCAzLjg4LjkyIDcuNTQgMi41NiAxMC43OGw3Ljk3LTYuMTl6Ii8+PHBhdGggZmlsbD0iIzM0QTg1MyIgZD0iTTI0IDQ4YzYuNDggMCAxMS45My0yLjEzIDE1Ljg5LTUuODFsLTcuNzMtNmMtMi4xNSAxLjQ1LTQuOTIgMi4zLTguMTYgMi4zLTYuMjYgMC0xMS41Ny00LjIyLTEzLjQ3LTkuOTFsLTcuOTggNi4xOUM2LjUxIDQyLjYyIDE0LjYyIDQ4IDI0IDQ4eiIvPjwvc3ZnPgo=';

export function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <Image
      source={{ uri: GOOGLE_G_SVG }}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessible={false}
    />
  );
}
