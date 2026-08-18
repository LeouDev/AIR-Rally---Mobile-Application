# End-to-end testing findings — 2026-08-18

Scope: full mobile app (Phases 0–4) against the production Supabase
project with the dedicated test accounts, local web API on test-mode
PayMongo keys. Native iOS Simulator (iPhone 17 Pro, iOS 26.5) plus the
Expo web target. No real money moved at any point.

## What was proven working

- **Auth loop** (native + web target): sign-up with agreement recording,
  sign-in, session persistence, sign-out, route guards.
- **Explore → venue → slots**: live `venue_marketplace` data, cover
  photos from the public bucket, `get_available_slots` grid in the
  venue's timezone.
- **Full payment loop**: reserve (booking created pending, slot held by
  the exclusion constraint) → PayMongo Checkout Session (correct line
  item and amount, rendered inside the native ASWebAuthenticationSession
  sheet) → **webhook-confirmed** via a signed test-mode
  `checkout_session.payment.paid` event against the local endpoint
  (`confirmed: true`, real `confirm_paymongo_booking_payment` path) →
  status screen flipped to the green confirmed card with the
  confirmation code.
- **Cancellations, all three flavors**, each stating the server-decided
  money story: pending unpaid ("nothing was charged"), paid inside 48h
  ("not eligible for credit"), and the slot verifiably released (times
  reappeared in the availability grid).
- **Status polling**: server-side status changes picked up live by the
  booking screen without user interaction.
- **Alerts**: live notification list, optimistic mark-as-read with
  rollback, persisted across refetch. Player and admin streams both
  fire on booking events.
- **Credits card** on Profile (₱0 wallet renders as ₱0, no-row case).
- **Owner dashboard empty state** ("No venues on this account").

## Issues and observations

1. **Deep link to a guarded route bounces to Explore.** Opening
   `/venue/<id>` cold (or any protected URL) redirects through the
   sign-in guard while the session is still hydrating from storage, and
   the original target is lost. Needs a loading gate before
   `Stack.Protected` decides. (Mobile; medium.)
2. **Admin notification fan-out is noisy.** The admin test account
   received a notification for *every* booking event on the platform
   (created, cancelled) alongside the player's own copy. At any real
   volume this drowns the Alerts tab. Consider severity filtering or a
   separate admin digest. (Web/platform; product decision.)
3. **Push notifications remain unexercised.** Expo Go cannot receive
   remote push (SDK 53+); `device_push_tokens` registration no-ops there
   by design. The trigger → webhook → Expo Push send path is deployed
   nowhere yet (migration unapplied). Needs an `expo-dev-client` build
   plus applying the migration, then a device test. (Both repos; next
   phase.)
4. **Owner dashboard with real data is untested.** The demo venues
   belong to the "Venue Owner (Test)" account whose password isn't on
   hand, and permission tooling (correctly) blocked service-role
   mutation scripts for reassigning ownership or resetting that
   password. The screen is code-complete and its empty state verified.
   Unblock by any of: signing the simulator into the test owner account,
   reassigning one demo venue to the admin account, or approving the
   reassignment script. (Blocked on operator input.)
5. **`expo start` exits silently when stdin hits EOF** (non-interactive
   launch). Metro "disappearing" mid-session traced to this; fixed by
   keeping stdin open in the launch config. Worth knowing for CI or any
   scripted `expo start`. (Tooling.)
6. **Expo typed routes lag the filesystem.** A new route fails
   `tsc --noEmit` until the dev server regenerates
   `.expo/types/router.d.ts`. Run typecheck with Metro up. (Tooling.)
7. **`PressableStateCallbackType` differs between bare tsc and the
   expo-env context** (`hovered` unknown vs required, RN 0.86 web
   types). Components should pass the state object through rather than
   constructing `{ pressed }` literals. (Mobile; workaround in place.)
8. **`expo-notifications` logs a warning on the web target** ("push token
   changes not supported on web") — harmless; could be silenced by
   gating the listener registration by platform. (Mobile; trivial.)
9. **Checkout URL slug is the session id sans prefix**
   (`checkout.paymongo.com/<x>` ↔ `cs_<x>`) — handy for debugging.
10. **Payment-return page copy must stay unverified-neutral.** The page
    echoes an `outcome` URL param and verifies nothing, so its copy may
    not assert "payment received" (fixed during this session — the
    booking row poll is the only source of payment truth).
11. **CORS on `/api/mobile/*` is wildcard by design** — bearer-only
    auth, no cookies, so no credentialed-CORS surface; exists for the
    Expo web target during development.

## Test-data footprint (all on test accounts, all resolved)

- Four ₱700 bookings on [DEMO] BGC Smash Pickleball's Rooftop Court for
  Aug 18 (test player ×3, admin ×1): all ended cancelled; one traversed
  pending → confirmed (simulated webhook) → cancelled first. No refunds
  due anywhere (nothing was actually paid).
- Notification rows generated for those events remain (useful test
  data for the Alerts tab).
- No venue, court, profile, or wallet rows were modified.
