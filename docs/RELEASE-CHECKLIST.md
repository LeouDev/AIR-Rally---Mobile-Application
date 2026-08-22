# Release checklist

Everything that has to be true before an AIR/Rally mobile release, and everything knowingly shipping unverified.

This exists because the state below was held across several parallel working sessions and nowhere else. That works while people are talking constantly and evaporates the moment they stop. A release cut from memory will most likely miss the ordering in §2 and the grouping in §1 — and both of those produce user-visible wrongness rather than a failed build, which is the worse kind of miss.

---

## 1. Three changes must ship in the same binary

These all move the OTA runtime version, so **none of them can ship over the air**. An `eas update` carrying any of them silently does not apply, because the update no longer matches the binary's fingerprint.

| Change | Why it moves the fingerprint |
| --- | --- |
| `66f5e4b` — camera/microphone permission removal | config-plugin props are fingerprint input |
| Sentry install (`6cc8927`) | native dependency **and** a config plugin |
| Sentry org/project slugs (`91207f5`) | config-plugin props again |

Verify before cutting:

```bash
npx expo-updates fingerprint:generate --platform ios
```

Recompute rather than trusting any number written down, and delete `ios/`/`android/` first — native directories are fingerprint input, so a value computed while they exist is not comparable to what EAS builds from.

## 2. Release ordering — load-bearing

1. Web's analytics fix merges **and deploys** first, including `getOwnerDashboardSummary` moving off `currentWeekBoundsUtc()` in the *same* change. Without that, the owner dashboard and the analytics page disagree about what a week is, on the same site, for the same owner.
2. The mobile RC is cut from the **same commit pair**.
3. Submit iOS.

Web goes first deliberately. During App Store review a Manila owner sees correct web numbers and stale mobile ones, rather than a mobile app that is ahead of the site. The lag lands on the surface that is easier to explain, and some divergence is unavoidable because review takes days.

## 3. Before cutting the RC

- [ ] `eas env:list --environment production` shows all four required variables, `EXPO_PUBLIC_SENTRY_DSN` included.
- [ ] Source-map upload confirmed **succeeding**, not merely configured. A Debug build proves only that the phase no longer fails — the upload is a no-op without an auth token. Only a Release build on EAS exercises it.
- [ ] `app.json` version is not `0.1.0`. Whatever ships is the public version string permanently, and `error-reporting.ts` stamps it into every crash report, so it is also the version read in support tickets.
- [ ] Backend's drift check **findings understood and accepted** — deliberately not "zero findings". Once 076/077/078 are in the tree, production reads as drifted until they are applied, and that red is *correct*. Nobody should block on it, and nobody should ever fix it by editing the check.
- [ ] **Sentry delivery confirmed in the dashboard**, not just capture. See §6 — this is a thirty-second check and until someone does it, "we have crash reporting" means captured, not delivered.

### Gates this repo does not own

Mobile cannot see these and will pass its own checks without them. They are listed here because a checklist that only gates what its author controls is complete-looking and wrong — the same shape as everything else in §6.

- [ ] **QA's booking matrix clean.** Mobile's suite proves the client; the matrix proves the flows against a real backend.
- [ ] **Backend's staging sequence complete**, through the two-function coexistence measurement. That coexistence is the shape production will briefly be in during the migration, and staging is the only place it is safe to be wrong about.
- [ ] **Web deployed** — see §2. This is an ordering gate, not just a dependency: the mobile RC must not be submitted before it.

### Never submit a locally-built archive

`scripts/check-build-env.js` runs as `eas-build-post-install`, which is an **EAS Build lifecycle hook**. `npx expo run:ios` does not run it, so the guard is absent from exactly the environment we now spend most of our time in. Anything reaching a user goes through `eas build`.

Deliberately not wrapped around `npm run ios`: on a development profile the guard passes on the three always-required variables and buys nothing, while creating precisely the false confidence it exists to prevent.

### What the guard does not cover

`check-build-env.js` validates **environment variables**. It has no knowledge of `app.json` plugin config, so it would *not* have caught the missing Sentry slugs. That is the correct boundary — the slugs failed the build loudly, and loud failures do not need a guard; silent degradations do. Write it down so nobody assumes the guard covers "anything that breaks a release build."

### Before cutting, grep for debug probes

```bash
grep -rn "PROBE\|__DEBUG_\|setTimeout(() => { throw" src/
```

Temporary probes are a different order of hazard from everything else on this list: a screen-level `setTimeout` that throws does not degrade anything, it crashes the app on a timer for real users.

### Behavioural tests cannot see position

Any change to a floating or absolutely-positioned element needs eyes on a running build, and **no amount of green justifies skipping it**.

`environment-banner.test.tsx` has six passing tests — renders nothing in production, names the environment, never intercepts touches — and not one could catch a positioning collision. That is correct test design, and it is exactly *why* they survived two repositions without failing. The banner has now collided twice, in two different positions, and both were found by looking at a screen.

## 4. Before submitting to the App Store

These gate **submit**, not **build**, and the last two can only be completed by the account holder in App Store Connect.

- [ ] **Privacy nutrition labels updated for Sentry.** The listing copy was drafted before Sentry existed in this app. Per Sentry's own privacy-manifest documentation the SDK collects three declarable categories, all as *App Functionality*, neither linked to the user nor used for tracking:
  - Crash Data (`NSPrivacyCollectedDataTypeCrashData`)
  - Performance Data (`NSPrivacyCollectedDataTypePerformanceData`)
  - Other Diagnostic Data (`NSPrivacyCollectedDataTypeOtherDiagnosticData`)

  It also declares three required-reason API accesses: UserDefaults (`CA92.1`), System Boot Time (`35F9.1`), File Timestamp (`C617.1`).

- [ ] **Do not declare camera or microphone.** `66f5e4b` removed both from the binary, so declaring them would be a false statement about what the app collects. That commit has a compliance dimension beyond the Play Store question it was filed under: it keeps the iOS privacy declaration honest.

- [ ] **Confirm a `PrivacyInfo.xcprivacy` reaches the binary.** Sentry's docs state the SDK does *not* ship one for **statically linked** libraries — which is React Native's default, and nothing in this repo sets `useFrameworks`. `app.json` currently has no `ios.privacyManifests` key, though `@expo/config-plugins` supports one. **Unverified:** whether `expo prebuild` emits a usable default. Check the generated `ios/` before submitting; a missing manifest is a review rejection, not a warning.

## 5. Before the first OTA update to production

This does **not** gate the release candidate — the binary ships fine without it. It gates *depending* on OTA, so it sits here rather than in §3, where it would be skipped as obviously-not-blocking and then be untested at the moment it is needed.

- [ ] **Publish / install / rollback exercised end to end.** Open since Cycle 1 and never run. An untested rollback procedure is a document, not a rollback procedure.

Run it on **Android** — separately metered, none spent, and the update mechanism, fingerprint policy and channels are identical, so Android proves the machinery. Sequence: `preview` build → install → `eas update --channel preview` with a cosmetic JS-only change → confirm it installs on relaunch → `eas update:republish` to the previous group → confirm it reverts.

`preview` points at **production Supabase**. Build-and-update only: no bookings, no matches, nothing touching a court slot or money.

## 6. Shipping knowingly unverified

Written down as unverified rather than quietly passed.

- **Push notification delivery** — unverifiable on staging. Staging holds no Vault secrets, so the webhook path fails open and logs nothing.
- **PayMongo stale-booking expiry** — same cause. The sweep silently never runs on staging, which also makes the pending-booking screen's "the slot releases automatically" copy false there.
- **COURT/Side `court_side_feed` (077)** — verified at volume, but RLS was **not** exercised (connected as `postgres`, `auth.uid()` simulated at SQL level). End-to-end through supabase-js with a real token is unclaimed.
- **Crash coverage — capture measured, delivery unconfirmed.** On a real build, Sentry's global handlers demonstrably *capture* an uncaught handler throw and an unhandled rejection — the two shapes the error boundary structurally cannot reach. That much is empirical.

  Delivery is not. The evidence is `Captured error event` lines, and `@sentry/core`'s `client.js:736` emits that at the **top of `_captureEvent`, before `_processEvent` is called** — transport happens in the `.then()` afterwards, and the failure path only logs on rejection. A malformed DSN, a deleted project, a network failure or rate limiting all produce an identical `Captured` line followed by silence.

  Closing it costs thirty seconds: open the Sentry dashboard and look for the probe events. Until someone does, "we have crash reporting" means captured, not delivered.

  The local AsyncStorage reports and the branded error screen remain render-phase only, by design: a global handler has no fallback UI to render into.
- **Source-map upload** — see §3.
- **`expo-notifications` registration error on every launch** — `Error reading persisted server registration info: FunctionCallException: getRegistrationInfoAsync has failed`. Simulator push registration is the boring explanation and no physical device has been available to compare. **If this appears on physical hardware it becomes a real finding**, not an accepted one — recorded with that condition attached so the first person to see it there does not spend an hour rediscovering it.

## 7. Quotas and ceilings

| | |
| --- | --- |
| iOS EAS builds | 15 per month |
| Android EAS builds | 15 per month, separately metered |
| OTA updates | **1,000 MAUs** on the free plan |

**Read the remaining count off the dashboard rather than from here.** These are consumable and per-platform, and a number written into a document is wrong the moment someone builds. Getting this wrong in both directions has already cost a cycle of churn once: a combined "13 / 30" was read as the iOS allowance when iOS and Android are metered separately.

The MAU ceiling is the one worth planning for. The entire OTA strategy — fingerprint policy, channels, the rollback procedure in the README — runs on a tier covering 1,000 monthly active users. At 1,001 it becomes a paid decision made under pressure, at the exact moment we can least afford a surprise.

## 8. Post-launch, recorded so it is not rediscovered

- **Nobody can cancel an Open Play game, on either platform.** The service function exists in both repos (`src/lib/events.ts:177` on mobile) and nothing calls it. Small on mobile — a button and a confirmation, with the notification machinery already firing on the status flip.
- **Cancelling a booking leaves its Open Play game `published`**, so it stays visible and joinable in the Play tab for a court nobody has booked.
- Orphaned payable PayMongo sessions need a reconciliation sweep.
- `reviews.booking_id` survives a booking cancel.
- Three policy names exceed Postgres's 63-byte identifier limit.
- Migration governance: no ledger, past numbering collisions, baselining deferred.
- The 23 React Compiler bail-outs (`expo lint` errors) — those components get no auto-memoization while the rest of the app does.
- **The environment banner needs to stop being a fixed-offset overlay.** It has collided twice — pinned to the top it sat inside the navigation header; pinned to the bottom it sat on the sign-up screen's consent row, partially covering the agreement version string. A fixed offset has no safe edge, because there is no offset that is empty on every screen, so a third position relocates the problem rather than removing it.

  The fix is a slim full-width strip that **reserves layout space**, which cannot overlap by construction. It costs a few points of vertical space on non-production builds only — the right place to spend it. Deliberately not done before the RC: it is P3, invisible to users, and it needs the safe-area handling done properly (a strip consuming `insets.top` must also stop child screens re-applying it) rather than rushed.

## 9. What mobile testing cannot tell you

- **A deep-link pass proves the router works and says nothing about what the database stamps.** `/profile/rank` and `/ranked` both resolve to the Profile tab, so a link-string drift between the two would pass a mobile test identically. Link strings belong to Backend's body-reconciliation sweep, not to a navigation check.
- **Ranked results obtained before the staging repair are void** — staging was running an `apply_ranked_result` variant present in no commit.
- **Before grepping a Metro bundle for anything, confirm the bundle contains your app.** A grep for the DSN returning zero occurrences nearly got reported as "Sentry isn't in the build", when the real cause was that the bundle Metro served contained no app code at all — no `BookingPanel`, no `EnvironmentBanner`. The zero was true about the artifact and false about the world.
