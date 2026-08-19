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

**Every profile — `.env.local` (day-to-day `npx expo start`), and `eas.json`'s `development`, `development-device`, `preview`, and `production` build profiles — points at production Supabase (`hrpbjudsrqcgyrkkodop`) and `https://air-rally.com`.** There is no hosted staging deployment of the web app (checked — no staging domain in `vercel.json` or `.env.staging`) and no separate staging mobile config either; production is the only environment this app talks to, full stop. A Supabase bearer token is only valid against the project that issued it, so `EXPO_PUBLIC_SUPABASE_URL` and whatever `EXPO_PUBLIC_API_URL` points at must always target the *same* project's data, or every `/api/mobile/*` call 401s.

This is a real, live consequence, not a hypothetical: **every booking, venue, credit, and profile this app touches from any build — including a plain `npx expo start` on a laptop — is real production data.** PayMongo on production is currently in TEST mode (card charges are simulated), but nothing else about a booking is simulated. Do not create test data through this app without a clear plan to clean it up through the app's own flows (e.g. cancelling a booking/match you created), never by deleting rows directly.

`production`'s values are not in this file — that profile is linked to EAS's server-side Environment Variables (`environment: "production"`; `eas env:list --environment production`) rather than an inline `env` block, so it can be rotated without a repo change. The other three profiles' values are inline here and in `eas.json` and must be kept in sync with `production`'s by hand.

If a hosted staging deployment of the web app (and a separate staging Supabase project) is ever stood up again, retarget `development`/`development-device`/`preview` at it — that's what removes the production-data tradeoff for day-to-day development.

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
