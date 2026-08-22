# Release checklist

Everything that has to be true before an AIR/Rally mobile release, and everything knowingly shipping unverified.

This exists because the state below was held across several parallel working sessions and nowhere else. That works while people are talking constantly and evaporates the moment they stop. A release cut from memory will most likely miss the ordering in §2 and the grouping in §1 — and both of those produce user-visible wrongness rather than a failed build, which is the worse kind of miss.

---

## 1. Four changes must ship in the same binary

These all move the OTA runtime version, so **none of them can ship over the air**. An `eas update` carrying any of them silently does not apply, because the update no longer matches the binary's fingerprint.

| Change | Why it moves the fingerprint |
| --- | --- |
| `66f5e4b` — camera/microphone permission removal | config-plugin props are fingerprint input |
| Sentry install (`6cc8927`) | native dependency **and** a config plugin |
| Sentry org/project slugs (`91207f5`) | config-plugin props again |
| iOS privacy manifest (`ios.privacyManifests`) | native config; **verified** — adding it moved the hash `7d6b11ea` → `1261e1f5` |

Verify before cutting:

```bash
npx expo-updates fingerprint:generate --platform ios
```

Recompute rather than trusting any number written down, and delete `ios/`/`android/` first — native directories are fingerprint input, so a value computed while they exist is not comparable to what EAS builds from.

### What actually is and is not fingerprint input

Read off the generated source list, not assumed. Outside `node_modules`, the inputs are `.gitignore`, **`eas.json`**, the two icon assets, `app.json`, config plugins, autolinking, and **`packageJson:scripts`**.

**Nothing under `src/` is a fingerprint input — zero sources reference it.** So any change confined to `src/` is OTA-shippable by construction, however large. That is a structural fact, not an observation about one commit.

Two counterintuitive consequences worth knowing before someone is surprised:

- **`eas.json` is fingerprint input, including its `env` values.** Changing an environment variable there moves the runtime version, so an env change *cannot* ship over the air.
- **`package.json` `scripts` are fingerprint input.** `expo prebuild` rewrites them — it changed `"ios": "expo start --ios"` to `"expo run:ios"` during local build work here, and that was reverted. Committing it would have silently moved the runtime version off the most innocuous-looking diff imaginable.

**Freeze all of the above between cutting an RC and publishing an update meant for it.** If any of them changes in between, the update's runtime version no longer matches the shipped binary and it silently will not apply — the same silent non-application the fingerprint policy exists to cause deliberately, arriving by accident.

## 2. Release ordering — load-bearing

1. Web's analytics fix merges **and deploys** first, including `getOwnerDashboardSummary` moving off `currentWeekBoundsUtc()` in the *same* change. Without that, the owner dashboard and the analytics page disagree about what a week is, on the same site, for the same owner.
2. The mobile RC is cut from the **same commit pair**.
3. Submit iOS.

Web goes first deliberately. During App Store review a Manila owner sees correct web numbers and stale mobile ones, rather than a mobile app that is ahead of the site. The lag lands on the surface that is easier to explain, and some divergence is unavoidable because review takes days.

## 3. Before cutting the RC

- [ ] `eas env:list --environment production` shows all four required variables, `EXPO_PUBLIC_SENTRY_DSN` included.
- [ ] `app.json` version is not `0.1.0`. Whatever ships is the public version string permanently, and `error-reporting.ts` stamps it into every crash report, so it is also the version read in support tickets.
- [x] **iOS privacy manifest declared in `app.json`.** Moved here from "before submitting" because it is **fingerprint input and cannot be retrofitted** — if the RC is cut without it, fixing it costs a second binary out of two.

  Nothing generates one otherwise, all four checks confirmed: `@sentry/react-native` ships no `.xcprivacy` (its docs say so explicitly for **statically linked** libraries, which is React Native's default and what this project uses), `expo prebuild` emits none, and the app declared none. The declaration is *derived* from `node_modules/**/*.xcprivacy` rather than guessed — the union of every required-reason API its dependencies declare, plus Sentry's three collected-data categories from Sentry's own documentation. Verified end to end: `prebuild` now emits `ios/AIRRally/PrivacyInfo.xcprivacy`, wired into the Xcode target.

  **Worth a human sanity-check before submitting** — it is a compliance declaration derived from what is in the tree *today*, and a new dependency can add a required-reason API without anyone noticing. Same family as everything in §6: a claim that was true when made, with no mechanism for noticing it stopped being true.

  *The eventual mechanism, when this comes up again:* the derivation done by hand here is a script — walk `node_modules/**/*.xcprivacy`, union the declared API sets, diff against `app.json`'s declaration, fail on a delta. Same shape and same reason as the schema drift check. An afternoon, not a project, and it converts this from a memory-dependent gate into a mechanical one. Deliberately not before the RC.
- [ ] Backend's drift check **findings understood and accepted** — deliberately not "zero findings". Once 076/077/078 are in the tree, production reads as drifted until they are applied, and that red is *correct*. Nobody should block on it, and nobody should ever fix it by editing the check.

  **The drift check cannot tell you whether all migrations are applied**, and must not be read as if it can. It compares live object *definitions*, so a migration that changes a definition under an unchanged name is invisible to it — production currently reports four findings while 076 and 079 are also unapplied and unseen. "Drift check green" means "no detected difference", not "production is up to date". Answering the second question directly is what the deferred migration ledger is for, and is exactly what this sweep structurally cannot do.
- [x] **Sentry capture and delivery verified end to end.** See §6 for the evidence chain.
- [ ] **Source-map upload confirmed on a RELEASE build** — the first real crash arrives readable, not minified. Deliberately a separate line from the one above: the probes ran on a local *debug* build, where Metro serves source maps and `DebugSymbolicator` handles symbolication, so a readable trace there proves nothing about release. The slugs fixed the build *failure*; whether the upload *succeeds* with the real token is a different observation and only a release build can make it.

### Gates this repo does not own

Mobile cannot see these and will pass its own checks without them. They are listed here because a checklist that only gates what its author controls is complete-looking and wrong — the same shape as everything else in §6.

- [ ] **QA's booking matrix clean.** Mobile's suite proves the client; the matrix proves the flows against a real backend.
- [ ] **Backend's staging sequence complete**, through the two-function coexistence measurement. That coexistence is the shape production will briefly be in during the migration, and staging is the only place it is safe to be wrong about.
- [ ] **Web's ANALYTICS branch deployed** — see §2. Ordering gate, not just a dependency: the mobile RC must not be submitted before it.

  Web is holding **two** separate pieces and only one of them is an RC gate. The analytics fix (venue-local revenue + `getOwnerDashboardSummary`) **is**, because the mobile RC carries the matching revenue fix and the two platforms must not disagree about what a week is during App Store review. Web's COURT/Side client work is **not** — it moved to §5 with Following. Conflating them silently drops an ordering gate.

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

**This is now a live plan, not a contingency.** COURT/Side "Following" was deliberately cut from the release candidate and will ship as the first production OTA update, because it is confined to `src/` and therefore cannot move the fingerprint (see §1). The deciding argument was reversibility: a wrong *sequence* shipped in a binary is permanent, and the same mistake shipped by update is one `republish` away — and sequencing is our most demonstrated failure mode.

Everything below was optional while OTA was hypothetical. None of it is now.

- [ ] **`077-expand` applied and verified on production.** Moved here from the RC gates: the binary no longer carries the 4-arg call site, the *update* does. A client calling the 4-arg `court_side_feed` against a database holding only the 2-arg one fails every COURT/Side request — but by update that is recoverable, which is the whole point of the two-stage plan.

  A stale 2-arg call has been observed as PostgREST `PGRST202` and reported as Postgres `42883`. After a fourth measurement the two windows are settled, not just the fact that both occur:

  | State | Code | Why |
  | --- | --- | --- |
  | Cache **fresh** (steady state) | `PGRST202` | PostgREST answers from cache, never reaches Postgres |
  | Cache **stale** (the transient window right after a drop) | `42883` | PostgREST believes the function exists, sends SQL, Postgres raises `undefined_function` |

  **Alerts and log filters match either** — the transient window is exactly when a deploy goes wrong. **Automated tests pin to `PGRST202`** — a test asserting `42883` never passes outside the seconds right after a schema change. **Direct SQL tooling is always `42883`** — it never goes through PostgREST's cache.
- [ ] **Mobile's Following wiring, Web's COURT/Side client work and QA's COURT/Side end-to-end leg all complete.** These stopped being RC gates and became pre-OTA gates; they did not stop being gates.

- [ ] **Publish / install / rollback exercised end to end.** Open since Cycle 1 and never run. An untested rollback procedure is a document, not a rollback procedure.

- [ ] **Fingerprint inputs frozen since the RC commit.** Checkable, not remembered — diff these seven paths against the RC commit and require an empty result:

  ```bash
  git diff --stat <rc-commit> -- .gitignore eas.json app.json package.json       assets/images/app-icon.png assets/images/mark.png
  # plus: no dependency added, removed or version-changed (autolinking is an input)
  ```

  If any of them moved, the update's runtime version no longer matches the shipped binary and **the update silently will not apply** — the same silent non-application the fingerprint policy causes deliberately, arriving by accident.

  > ⚠️ **`expo prebuild` rewrites `package.json` scripts, and those are fingerprint input.** It changed `"ios": "expo start --ios"` to `"expo run:ios"` during local build work here. Anyone who runs a local build inside the freeze window and commits the result breaks the Following update **off a diff that looks like nothing**. This is now the single most likely way the two-stage plan fails, precisely because it looks harmless.
  >
  > It has already been misdiagnosed once: this exact change was filed as evidence of shared-tree collisions between sessions, because that was the more comfortable explanation.

- [ ] **Understand that an environment-value change cannot ship over the air.** `eas.json` is fingerprint input *including its `env` block*. The Sentry DSN lives there. Anyone fixing a wrong env value and reaching for `eas update` will find it silently not applying — that needs a new binary.

Run it on **Android** — separately metered, none spent, and the update mechanism, fingerprint policy and channels are identical, so Android proves the machinery. Sequence: `preview` build → install → `eas update --channel preview` with a cosmetic JS-only change → confirm it installs on relaunch → `eas update:republish` to the previous group → confirm it reverts.

`preview` points at **production Supabase**. Build-and-update only: no bookings, no matches, nothing touching a court slot or money.

## 6. Shipping knowingly unverified

Written down as unverified rather than quietly passed.

**Every entry here and in §8 carries two things beyond its description: which ENVIRONMENT the claim is true of, and WHAT WOULD RETIRE IT.** Without those, a list of known defects has no mechanism for noticing when one stops being true — each entry is a claim with an expiry date nobody set, expiring silently. That is precisely the failure family this document exists to guard against, reproduced inside the guard. It has already happened once here, within hours of the file being written.

- **Concurrent double-booking cannot double-charge — VERIFIED, not just reasoned.** Worth recording that this claim was upgraded twice, because the upgrade path is itself the lesson.

  It was first closed on **static analysis**: three independent readers traced the code and agreed that `bookings`' GiST exclusion constraint on `(court_id, tstzrange(start,end))` for `status in ('pending','confirmed')` means a losing concurrent insert raises `23P01` *before* PayMongo is ever touched. Reasoning, not measurement — closed on the strength of agreement, not evidence.

  QA treated "three people read the same code and agreed" as a different claim from "the race was run", and ran it: two genuinely concurrent `POST`s to `/api/mobile/checkout`, identical court and slot, same token. One succeeded (booking created, checkout URL issued); the other returned `200` with "That time slot is no longer available." Exactly one row exists server-side afterward — no duplicate, no orphan, no partial state.

  *Environment:* staging, at the network layer against the real database — the first time this was exercised as an actual race rather than read as code. *Retires:* already retired as a claim; kept here as the record that it was reopened deliberately after being closed on weaker evidence, not because anyone doubted the first answer.

- **Push notification delivery** — unverifiable on staging. Staging holds no Vault secrets, so the webhook path fails open and logs nothing.
  *Environment:* unverifiable on staging; unverified on production. *Retires when:* Vault secrets exist on staging and the webhook URL is parameterised, then a delivery is observed end to end.
- **PayMongo stale-booking expiry** — same cause. The sweep silently never runs on staging, which also makes the pending-booking screen's "the slot releases automatically" copy false there.
  *Environment:* broken on staging; believed working on production, never observed. *Retires when:* a pending booking is watched expiring on its own in either environment.
- **COURT/Side `court_side_feed` (077)** — verified at volume, but RLS was **not** exercised (connected as `postgres`, `auth.uid()` simulated at SQL level). End-to-end through supabase-js with a real token is unclaimed.
  *Environment:* staging. *Retires when:* someone drives the feed through supabase-js with a real user token and confirms the scope filter under RLS.
- **Crash coverage — VERIFIED end to end.** Every link measured rather than inferred:

  | Link | Evidence | By |
  | --- | --- | --- |
  | `initSentry()` actually runs | launch log: `Session replay disabled via configuration` | QA, on device |
  | Capture works for the shapes the boundary cannot reach | `SENTRY-PROBE-A` (uncaught handler throw), `SENTRY-PROBE-B` (unhandled rejection) | local release-mode-independent build |
  | **Delivery works** | both probe events visible in the Sentry project | founder, in the dashboard |
  | Same project everywhere | `.env.local`, `eas.json` and EAS production all resolve to `4511956256227328` | — |

  Worth keeping the reason delivery needed separate confirmation, because the log is misleading: `@sentry/core`'s `client.js:736` emits `Captured error event` at the **top of `_captureEvent`, before `_processEvent` is called**, and the failure path only logs on *rejection*. A malformed DSN, a deleted project, a network failure or rate limiting all produce an identical `Captured` line followed by silence. Capture logs can never evidence delivery.

  Still render-phase only, by design: the local AsyncStorage reports and the branded error screen. A global handler has no fallback UI to render into.

  **Source-map upload remains open** — see §3. Do not read this row as covering it.
  *Environment:* verified on a local debug build against the production Sentry project. *Retires:* already retired, except source maps.
- **`expo-notifications` registration error on every launch** — `Error reading persisted server registration info: FunctionCallException: getRegistrationInfoAsync has failed`. Simulator push registration is the boring explanation and no physical device has been available to compare.
  *Environment:* iOS Simulator only; unobserved on hardware. *Retires when:* someone launches on a physical device — **if it appears there it becomes a real finding**, not an accepted one.

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
  *Environment:* both, unaffected by 078 — different mechanism, different fix. *Retires when:* `events.ts:177` is wired to a control on each platform.
- **Cancelling a booking leaves its Open Play game `published`** — it stays visible and joinable in the Play tab for a court nobody has booked.
  *Environment:* **LIVE ON PRODUCTION.** Fixed by 078 and verified on staging — booking cancelled, slot returned to `get_available_slots` checked by court id, linked event `status: cancelled` with `cancellation_reason: booking_cancelled`; `getOpenPlayGames` filters `.eq('status','published')` at `events.ts:63-67`, so a cancelled game is excluded by construction. *Retires when:* 078 is applied to production.
  Deliberately **not** moved to "verified fixed" and not deleted: either would leave someone believing production is fine when the defect is live there today. Stale-and-cautious beats fixed-and-wrong.
- Orphaned payable PayMongo sessions need a reconciliation sweep.
  *Environment:* both. *Retires when:* a reconciliation sweep exists and has run once.
- `reviews.booking_id` survives a booking cancel.
  *Environment:* both. *Retires when:* the cancel path nulls or flags it.
- **`/api/mobile/cancel` never stamps `cancelled_at` / `cancelled_by`.** Every booking cancelled through it has both null; other cancellation paths populate them. Nothing in the mobile client reads either field, and refund eligibility computes from `status`/`paid_at`, so this is audit-trail, not functional. **Unchecked:** whether web's admin tooling displays these fields — if it does, this is a visible blank rather than a latent one.
  *Environment:* both, via the mobile cancel path specifically. *Retires when:* support tooling exists or a support queue starts — deliberately not "when the code is fixed". Unlike most P3s here, the cost of leaving this **grows**: "who cancelled this and when" is the most common question a booking platform's support queue gets, and at twelve bookings nobody is asking. When a queue exists, the gap sits in what is by then the primary path, and applies **retroactively** to everything cancelled before the fix lands.
- Three policy names exceed Postgres's 63-byte identifier limit.
  *Environment:* both. *Retires when:* renamed — and the drift check gains a rule flagging any name over 63 bytes, so the next one is caught automatically rather than by memory.
- Migration governance: no ledger, past numbering collisions, baselining deferred.
  *Environment:* process, not code. *Retires when:* a migration ledger exists and baselining is done.
- The 23 React Compiler bail-outs (`expo lint` errors) — those components get no auto-memoization while the rest of the app does.
  *Environment:* both. *Retires when:* `expo lint` reports zero errors.
- **The environment banner needs to stop being a fixed-offset overlay.** It has collided twice — pinned to the top it sat inside the navigation header; pinned to the bottom it sat on the sign-up screen's consent row, partially covering the agreement version string. A fixed offset has no safe edge, because there is no offset that is empty on every screen, so a third position relocates the problem rather than removing it.

  The fix is a slim full-width strip that **reserves layout space**, which cannot overlap by construction. It costs a few points of vertical space on non-production builds only — the right place to spend it. Deliberately not done before the RC: it is P3, invisible to users, and it needs the safe-area handling done properly (a strip consuming `insets.top` must also stop child screens re-applying it) rather than rushed.
  *Environment:* non-production builds only — it renders nothing in production. *Retires when:* the banner reserves layout space instead of overlaying.

## 9. What mobile testing cannot tell you

- **A deep-link pass proves the router works and says nothing about what the database stamps.** `/profile/rank` and `/ranked` both resolve to the Profile tab, so a link-string drift between the two would pass a mobile test identically. Link strings belong to Backend's body-reconciliation sweep, not to a navigation check.
- **Ranked results obtained before the staging repair are void** — staging was running an `apply_ranked_result` variant present in no commit.
- **Before grepping a Metro bundle for anything, confirm the bundle contains your app.** A grep for the DSN returning zero occurrences nearly got reported as "Sentry isn't in the build", when the real cause was that the bundle Metro served contained no app code at all — no `BookingPanel`, no `EnvironmentBanner`. The zero was true about the artifact and false about the world.
