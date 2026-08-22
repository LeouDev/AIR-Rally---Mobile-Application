# AIR/Rally Mobile

The iOS/Android companion to [air-rally.com](https://air-rally.com) — Expo (SDK 57) + expo-router + React Native, talking to the **same Supabase project** as the web app via `@supabase/supabase-js` and reusing its RLS policies unchanged. A deliberately separate sibling repo: the web repo's path contains a colon, which breaks parts of the RN/Metro toolchain.

## Architecture in one paragraph

Auth, data reads, and RPCs go straight to Supabase (no API middleman) — RLS is the security boundary, exactly as it is for the web client. The one exception is payments: PayMongo checkout sessions are created by the web app's Next.js API (bearer-token auth), because provider secrets live server-side only. Push notifications ride the web repo's existing notification fan-out: a DB trigger (`supabase/migrations/20260810000065_device_push_tokens.sql` in the web repo) posts every `notifications` INSERT to `/api/webhooks/notification-push`, which sends via Expo Push to every token this app registered through the `register_push_token` RPC.

## Scope

Player-side first: browse & book courts, pay (PayMongo WebView + `airrally://` deep-link return), manage bookings, notifications + push, profile/credits — plus a read-mostly owner bookings/earnings view. The owner application wizard stays web-only.

## Get started

```bash
npm install
cp .env.example .env.local   # fill in the Supabase URL + publishable key
npx expo start
```

- `i` / `a` — iOS Simulator / Android emulator (requires Xcode / Android Studio)
- `w` — web preview (handy for quick checks; native is the real target)

## Environments

| Where | Supabase project | `EXPO_PUBLIC_API_URL` |
| --- | --- | --- |
| `.env.local` (day-to-day `npx expo start`) | **staging** `vdxdmtsnptzodabaojlc` | `http://localhost:3000` |
| `eas.json` → `development` (simulator) | **staging** | `http://localhost:3000` |
| `eas.json` → `development-device` | **staging** | `http://localhost:3000` (see below) |
| `eas.json` → `preview` | **production** `hrpbjudsrqcgyrkkodop` | `https://air-rally.com` |
| `eas.json` → `production` | **production**, via EAS server-side env | `https://air-rally.com` |

**The binding rule: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_API_URL` must target the same Supabase project.** A Supabase access token is only valid against the project that issued it, so a staging token sent to production's API 401s on every `/api/mobile/*` call — checkout, cancel, reschedule, account deletion. Reads keep working, which is what makes the mistake easy to miss until someone tries to pay. `src/lib/environment.ts` detects this pairing at runtime and the in-app banner names it.

### Local development needs the web dev server

`http://localhost:3000` is the web repo's own dev server, which already points at the same staging project:

```bash
cd "/Users/leou/AIR:Rally" && npm run dev
```

Without it, browsing, availability, COURT/Side, Ranked and profile all work against staging; the four `/api/mobile/*` calls fail with the app's ordinary "Could not reach AIR/Rally" message.

`development-device` builds run on a real handset, where `localhost` is the *phone*, not your Mac. Override `EXPO_PUBLIC_API_URL` with your Mac's LAN address (`http://192.168.x.x:3000`) or a tunnel before building that profile.

### `preview` is still production

`preview` is an installable internal build with no dev server attached, so it needs a *hosted* API — and there is no staging deployment of the web app (`vercel.json` carries no staging domain). It therefore stays on production Supabase and `https://air-rally.com`, and **anything done in a preview build is real production data**. PayMongo on production is in TEST mode, so card charges are simulated; nothing else about a booking is. Clean up test data through the app's own flows (cancel the booking/match you created), never by deleting rows directly.

Standing up a staging web deployment is what removes this last exception — retarget `preview` at it and every non-production surface is off production for good.

### Telling builds apart

Every `EXPO_PUBLIC_*` value is baked in at build time, so two builds on the same home screen look identical while writing to different databases. `EnvironmentBanner` (rendered by the root layout) shows a persistent label on any build that is not correctly-configured production, and a red one when the API base and Supabase project disagree. It renders nothing at all on a real production build.

`production`'s values are not in `eas.json` — that profile is linked to EAS's server-side Environment Variables (`environment: "production"`; `eas env:list --environment production`), so it can be rotated without a repo change.

## Error handling and crash reporting

`src/app/_layout.tsx` exports an `ErrorBoundary`, which is expo-router's own mechanism — exporting one from a route wraps that route in a React error boundary, and exporting it from the **root** layout wraps the entire app, providers included. No dependency is involved. It renders `ErrorScreen`: AIR/Rally's own palette and wordmark, a plain-language explanation, **Try again** (the router's `retry`), and **Send report**.

`ErrorScreen` never renders `error.message`. That string is where a raw Postgres or Supabase error would otherwise reach a customer; it travels only through **Send report**, and only when the player taps it. A test asserts this directly.

### Why no crash-reporting SDK is installed yet

Every fatal error funnels through one function, `captureFatalError` in `src/lib/error-reporting.ts`. Today it writes a structured report to the device log and keeps the last five in `AsyncStorage`, so a crash survives the restart that follows it.

A provider is **not** installed because one cannot be configured without an account only the operator can create, and an unconfigured SDK is strictly worse than none — it adds native weight to every build and reports nothing.

**To add Sentry** (recommended: it is the option Expo documents for this architecture, and the free tier covers 5,000 events/month):

1. Create a Sentry account and a React Native project; note the **org slug**, **project name** and **DSN**.
2. Create an **organization auth token** under Developer Settings → Auth Tokens.
3. Add `SENTRY_AUTH_TOKEN` to the EAS build environment with *sensitive* visibility (`eas env:create`).
4. Run `npx @sentry/wizard@latest -i reactNative` — it installs the package, wires the Metro config and adds the init call.
5. Add one line to `captureFatalError`:
   ```ts
   Sentry.captureException(error, { extra: report });
   ```
6. Make a new release build. Source maps upload as part of it, so a native rebuild is required; JS-only OTA updates need `npx sentry-expo-upload-sourcemaps dist`.

Steps 1–3 need the operator's own credentials and cannot be done from this repo.

## Over-the-air updates

`expo-updates` is configured with `runtimeVersion: { "policy": "fingerprint" }`. Each build profile publishes to its own channel:

| Build profile | Channel |
| --- | --- |
| `development` | `development` |
| `development-device` | `development-device` |
| `preview` | `preview` |
| `production` | `production` |

### Why `fingerprint` and not `appVersion`

`fingerprint` hashes everything that can affect the native runtime — dependencies, config plugins, `app.json`, native directories — and derives the runtime version from that hash. An update only installs on a binary whose fingerprint matches, so **a change that needs a new binary cannot be shipped over the air by mistake**. `appVersion` would have left that guarantee resting on someone remembering to bump `version` after every native change.

The tradeoff Expo names is that builds become necessary more often. That is the correct side to err on for a launch: an OTA update landing on an incompatible binary is a crash on a customer's phone with no way back.

Verified rather than assumed — appending a comment to a screen leaves the fingerprint identical (`d694c828…`), while adding one config plugin changes it (`65a9e6c0…`):

```bash
npx expo-updates fingerprint:generate --platform ios
```

### Publishing

```bash
eas update --channel preview --message "what changed"
```

Ship to `preview` first and confirm on a real install. Only then:

```bash
eas update --channel production --message "what changed"
```

### Rollback

An update is a pointer, so rolling back is republishing the pointer, not deleting anything:

```bash
eas update:list --branch production          # find the last good update group
eas update:republish --group <GROUP_ID>      # re-point the channel at it
```

`eas update:roll-back-to-embedded --channel production` is the escape hatch when *no* published update is good — it sends clients back to the JS that shipped inside the binary.

Three things worth knowing before relying on any of this:

- **Rollback is not instant.** Clients pick up the change on their next launch-and-check, so anyone mid-session keeps the bad update until they relaunch.
- **A rollback cannot fix a bad native build.** If the fingerprint changed, the only route is a new binary through App Store review.
- **The first OTA-capable build is the next one made.** Adding `expo-updates` changes the native runtime; binaries built before this commit have no update client and will never receive an update. Nothing already installed or submitted is affected by this change.

## Phase 0 status

- [x] Scaffold, AIR/Rally theme tokens (light + dark, ported from the web `globals.css`)
- [x] expo-router nav: `(auth)` stack + `(tabs)` Explore / Bookings / Alerts / Profile, guarded by session
- [x] Supabase auth (sign-up matches the web contract: profile metadata + `record_agreement_acceptance`)
- [x] Push-token registration (`register_push_token` RPC; graceful no-op in Expo Go/simulators)
- [ ] Remote push end-to-end needs a dev build with an EAS `projectId` (`npx eas init`, then a development build — Expo Go can't receive remote push)

## Conventions

- Design tokens live in `src/constants/theme.ts` — mirror any web `globals.css` change there.
- `src/lib/database.types.ts` is a hand-copied *slice* of the web repo's `src/lib/supabase/types.ts`; extend it per phase, keeping shapes identical to the source of truth.
- Screens read Supabase directly and rely on RLS — never add client-side `user_id` filters as a substitute for policy.
