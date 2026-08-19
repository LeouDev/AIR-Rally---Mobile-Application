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

`.env.local` (day-to-day `npx expo start`) and `eas.json`'s `development` build profile both pair **staging** Supabase (`vdxdmtsnptzodabaojlc`) with `http://localhost:3000` — the iOS Simulator shares the host Mac's network, so it can reach a locally-run `npm run dev` in the web repo. That pairing is load-bearing: a Supabase bearer token is only valid against the project that issued it, so `EXPO_PUBLIC_SUPABASE_URL` and whatever `EXPO_PUBLIC_API_URL` points at must always target the *same* project's data, or every `/api/mobile/*` call 401s.

There is no hosted staging deployment of the web app (checked — no staging domain in `vercel.json` or `.env.staging`), so `eas.json`'s `development-device` profile (a build installed onto a real phone, which can't reach `localhost`) has no safe staging option and is pointed at **production** instead: production Supabase + `https://air-rally.com`. A device built with that profile talks to real production data and can trigger a real PayMongo charge — that's a real, live consequence, not a hypothetical, so be deliberate before handing someone a `development-device` build.

If a hosted staging deployment of the web app ever exists, retarget `development-device` at it instead — that removes the production-data tradeoff entirely.

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
