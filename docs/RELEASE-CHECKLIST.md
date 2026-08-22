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
- [ ] Backend's drift check green, or its findings understood and accepted. An unapplied migration showing as drift is correct behaviour and is not fixed by editing the check.

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

## 4. Shipping knowingly unverified

Written down as unverified rather than quietly passed.

- **Push notification delivery** — unverifiable on staging. Staging holds no Vault secrets, so the webhook path fails open and logs nothing.
- **PayMongo stale-booking expiry** — same cause. The sweep silently never runs on staging, which also makes the pending-booking screen's "the slot releases automatically" copy false there.
- **COURT/Side `court_side_feed` (077)** — verified at volume, but RLS was **not** exercised (connected as `postgres`, `auth.uid()` simulated at SQL level). End-to-end through supabase-js with a real token is unclaimed.
- **Crash coverage — capture measured, delivery unconfirmed.** On a real build, Sentry's global handlers demonstrably *capture* an uncaught handler throw and an unhandled rejection — the two shapes the error boundary structurally cannot reach. That much is empirical.

  Delivery is not. The evidence is `Captured error event` lines, and `@sentry/core`'s `client.js:736` emits that at the **top of `_captureEvent`, before `_processEvent` is called** — transport happens in the `.then()` afterwards, and the failure path only logs on rejection. A malformed DSN, a deleted project, a network failure or rate limiting all produce an identical `Captured` line followed by silence.

  Closing it costs thirty seconds: open the Sentry dashboard and look for the probe events. Until someone does, "we have crash reporting" means captured, not delivered.

  The local AsyncStorage reports and the branded error screen remain render-phase only, by design: a global handler has no fallback UI to render into.
- **Source-map upload** — see §3.

## 5. Quotas and ceilings

| | |
| --- | --- |
| iOS EAS builds | 15/month, 13 spent — **two left** |
| Android EAS builds | 15/month, none spent |
| OTA updates | **1,000 MAUs** on the free plan |

The MAU ceiling is the one worth planning for. The entire OTA strategy — fingerprint policy, channels, the rollback procedure in the README — runs on a tier covering 1,000 monthly active users. At 1,001 it becomes a paid decision made under pressure, at the exact moment we can least afford a surprise.

## 6. Post-launch, recorded so it is not rediscovered

- **Nobody can cancel an Open Play game, on either platform.** The service function exists in both repos (`src/lib/events.ts:177` on mobile) and nothing calls it. Small on mobile — a button and a confirmation, with the notification machinery already firing on the status flip.
- **Cancelling a booking leaves its Open Play game `published`**, so it stays visible and joinable in the Play tab for a court nobody has booked.
- Orphaned payable PayMongo sessions need a reconciliation sweep.
- `reviews.booking_id` survives a booking cancel.
- Three policy names exceed Postgres's 63-byte identifier limit.
- Migration governance: no ledger, past numbering collisions, baselining deferred.
- The 23 React Compiler bail-outs (`expo lint` errors) — those components get no auto-memoization while the rest of the app does.

## 7. What mobile testing cannot tell you

- **A deep-link pass proves the router works and says nothing about what the database stamps.** `/profile/rank` and `/ranked` both resolve to the Profile tab, so a link-string drift between the two would pass a mobile test identically. Link strings belong to Backend's body-reconciliation sweep, not to a navigation check.
- **Ranked results obtained before the staging repair are void** — staging was running an `apply_ranked_result` variant present in no commit.
- **Before grepping a Metro bundle for anything, confirm the bundle contains your app.** A grep for the DSN returning zero occurrences nearly got reported as "Sentry isn't in the build", when the real cause was that the bundle Metro served contained no app code at all — no `BookingPanel`, no `EnvironmentBanner`. The zero was true about the artifact and false about the world.
