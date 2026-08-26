# Release checklist

Everything that has to be true before an AIR/Rally mobile release, and everything knowingly shipping unverified.

This exists because the state below was held across several parallel working sessions and nowhere else. That works while people are talking constantly and evaporates the moment they stop. A release cut from memory will most likely miss the ordering in §2 and the grouping in §1 — and both of those produce user-visible wrongness rather than a failed build, which is the worse kind of miss.

---

## RESOLVED — App Review approved, hold lifted 2026-08-26

**Build 9 (`1.0.0+9`) was approved by Apple and auto-released to the App Store the same minute** (`releaseType: AFTER_APPROVAL`, no manual gate — nobody had to press anything). Confirmed live by loading the App Store listing directly: developer name, description, and feature list all match this app. The freeze condition below ("nothing publishes... until that resolves, either outcome") was met by approval, so the hold is lifted.

Per the AI CTO, five OTAs have published against the current runtime since approval: a copy fix, the nine-commit August 24 batch, the three-piece doorway/team-identity/settlement release, the Play tab doorway, and a Facebook-button hide (in flight as of this writing) — reported, not independently itemized here.

The three items originally held below are kept as a record of what the freeze covered. Their status was **not reverified as part of this update** — check the migration/branch directly rather than assuming any of them shipped just because the hold lifted:

1. **Single unified rating** — migration `supabase/migrations/20260810000085_unify_player_rating.sql`. Designed and verified on staging, **applied nowhere** as of when this was written. Collapses per-mode ratings into one. DUPR math proven unchanged — all 12 engine outputs byte-identical before/after. Client work is roughly 17 files across mobile and web, **not started** as of when this was written.

   **CRITICAL: database and clients must ship in one coordinated window.** An old client against the new schema errors outright — verified, not predicted: `column "mode" does not exist`.

2. **Ranked-from-Open-Play** — branch `feature/ranked-from-game` @ `ed9a98d`. Founder-verified on device (published live, reverted after per the standing gate). JS-only, OTA-shippable now that the hold has lifted. Adds the mobile path from an Open Play game into a Ranked match — web already had this, mobile had nothing.

3. **Player-search debounce** — fix written, tests in progress, uncommitted as of when this was written. Addresses founder-reported tap lag on the ranked screens. Root cause is pre-existing, not something this fix introduced: a leading-wildcard `ILIKE` with no debounce, measured at 1.4s cold.

   The real fix underneath the debounce is a trigram index for `searchPublicProfiles` — tracked in §8's post-launch board. Debouncing hides the symptom; the index is what actually fixes the query. Worth keeping visible precisely because it's the kind of item that gets lost once the symptom stops being felt.

---

## 1. Five changes must ship in the same binary

These all move the OTA runtime version, so **none of them can ship over the air**. An `eas update` carrying any of them silently does not apply, because the update no longer matches the binary's fingerprint.

| Change | Why it moves the fingerprint |
| --- | --- |
| `66f5e4b` — camera/microphone permission removal | config-plugin props are fingerprint input |
| Sentry install (`6cc8927`) | native dependency **and** a config plugin |
| Sentry org/project slugs (`91207f5`) | config-plugin props again |
| iOS privacy manifest (`ios.privacyManifests`) | native config; **verified** — adding it moved the hash `7d6b11ea` → `1261e1f5` |
| App version, `app.json` (0.1.0 → 1.0.0) | `expo.version` is fingerprint input; **verified** — moved the hash `1261e1f5` → `f4f64031` |

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
- [x] `app.json` version set to `1.0.0`, matching `package.json`. Whatever ships is the public version string permanently, and `error-reporting.ts` stamps it into every crash report, so it is also the version read in support tickets. Confirmed fingerprint-moving: `1261e1f5` → `f4f64031`.
- [x] **iOS privacy manifest declared in `app.json`.** Moved here from "before submitting" because it is **fingerprint input and cannot be retrofitted** — if the RC is cut without it, fixing it costs a second binary out of two.

  Nothing generates one otherwise, all four checks confirmed: `@sentry/react-native` ships no `.xcprivacy` (its docs say so explicitly for **statically linked** libraries, which is React Native's default and what this project uses), `expo prebuild` emits none, and the app declared none. The declaration is *derived* from `node_modules/**/*.xcprivacy` rather than guessed — the union of every required-reason API its dependencies declare, plus Sentry's three collected-data categories from Sentry's own documentation. Verified end to end: `prebuild` now emits `ios/AIRRally/PrivacyInfo.xcprivacy`, wired into the Xcode target.

  **Worth a human sanity-check before submitting** — it is a compliance declaration derived from what is in the tree *today*, and a new dependency can add a required-reason API without anyone noticing. Same family as everything in §6: a claim that was true when made, with no mechanism for noticing it stopped being true.

  *The eventual mechanism, when this comes up again:* the derivation done by hand here is a script — walk `node_modules/**/*.xcprivacy`, union the declared API sets, diff against `app.json`'s declaration, fail on a delta. Same shape and same reason as the schema drift check. An afternoon, not a project, and it converts this from a memory-dependent gate into a mechanical one. Deliberately not before the RC.
- [ ] Backend's drift check **findings understood and accepted** — deliberately not "zero findings". Once 076/077/078 are in the tree, production reads as drifted until they are applied, and that red is *correct*. Nobody should block on it, and nobody should ever fix it by editing the check.

  **The drift check cannot tell you whether all migrations are applied**, and must not be read as if it can. It compares live object *definitions*, so a migration that changes a definition under an unchanged name is invisible to it — production currently reports four findings while 076 and 079 are also unapplied and unseen. "Drift check green" means "no detected difference", not "production is up to date". Answering the second question directly is what the deferred migration ledger is for, and is exactly what this sweep structurally cannot do.
- [x] **Sentry capture and delivery verified end to end.** See §6 for the evidence chain.
- [x] **Source-map upload — FULLY CLOSED, confirmed inside the actual shipped build, not just a local approximation.** Build 5 (`1.0.0`, `CFBundleVersion=5`, the RC already on TestFlight) never had working source maps and can't get them retroactively — see the recovery attempt below. Everything after build 5 is fixed.

  **What was wrong, found by opening the shipped `.ipa` directly rather than reasoning from the log:** `@sentry/react-native`'s iOS plugin (`withSentryIOS.js`) has exactly one mechanism for JS source maps — it patches the Xcode **"Bundle React Native code and images"** script phase to wrap `react-native-xcode.sh` with `sentry-xcode.sh`. The RC's decoded build log lists all 58 phases that actually executed; that phase is not among them, in any form — EAS's `EAGER_BUNDLE` phase runs Metro up front outside Xcode and writes the bundle to the exact path the Xcode phase's dependency-analysis expects as output, so Xcode treats the phase as already-satisfied and silently skips it. No log line, no failure, just absence. Separately and more fundamentally: the extracted `main.jsbundle` was real Hermes bytecode with zero debug-ID markers anywhere (`sentry-dbid-<uuid>`, `//# debugId=`, `//# sourceMappingURL=`, any `.map` reference) — because this repo had **no `metro.config.js` at all**, so the debug-ID-injecting Metro serializer was never wired in regardless of which build phase ran. Two independent gaps, not one; fixing only the first would have shipped a build believed symbolicated and wasn't.

  **Recovery attempt for build 5 specifically (recorded as a dead end, not left unresolved):** acceptance criteria written before running anything (`scratch/sourcemap-acceptance-criteria.md` — worth keeping as the reference for what "pre-registering before you see the result" looks like). Attempted to reproduce the shipped bundle locally at commit `3aacba5` via `expo export:embed --eager --bytecode`. Two disqualifying results before reaching a byte comparison: module count mismatch (shipped: 1869 modules; local: 2028) and the output wasn't Hermes bytecode at all — `--bytecode` produced plain minified JS text. Both consistent with a reproduction environment that isn't EAS's, not with the shipped code differing. **Conclusion: not recoverable** — build 5's source maps are accepted as permanently lost, superseded by the fix below.

  **The fix: `metro.config.js` wiring `@sentry/react-native`'s Metro serializer (`getSentryExpoConfig`).** Verified in three independent stages, each stronger than the last:

  1. **Fingerprint-safe.** Isolated worktree, fingerprint measured before and after adding it: identical both times, and confirmed as a genuine non-input (not a coincidental hash match) — the raw fingerprint JSON's only "metro" hits are unrelated dependency names. Clear to land pre-launch.
  2. **Works over the air, on real hardware.** Published live to the production channel alongside a deliberate crash trigger (`src/app/(tabs)/profile.tsx:98`, `handleSentrySymbolicationProbe`), tapped once on the founder's actual device. The resulting Sentry event, `SENTRY-SYMBOLICATION-PROBE`, resolved to real source (`profile.tsx:230:64`, real surrounding TypeScript) — not a bytecode offset. (Top frame was a different Pressable's `style` callback rather than line 98 itself, with 9 collapsed frames beneath — doesn't affect the close; see git history for the full frame-order writeup if the "why" ever matters.) Reverted after: `eas update:republish --group 9cf7977c-ed1f-45a7-adcb-a3de832089a3`, `runtimeVersion` confirmed matching.
  3. **Works inside a real Xcode-archived build.** Build 9 (`1.0.0+9`, EAS build `48c6afa0-4222-4025-aa7b-31b47debf593`), decoded xcodebuild log, not inferred: the **"Bundle React Native code and images"** phase — the one that silently never ran for the RC — executed for real this time, `sentry-cli react-native xcode` → `expo export:embed` → hermesc, the classic path. Hermes bundle produced with `-output-source-map`, composed, uploaded: `Bundle ID 3a3b8fc9-5de2-5214-b09b-268c7bda0950`, **debug id `fc20446e-2436-47a2-b5f3-3d069f26613e`** tagged on both `main.jsbundle` and `main.jsbundle.map`, `Release: com.airrally.app@1.0.0+9`, `Dist: 9`, `Uploaded files to Sentry` / `File upload complete`. dSYM upload also succeeded (22 files found, 1 missing uploaded). `ARCHIVE SUCCEEDED`, fingerprint `f4f64031fada4599a686f9e730a099c7cc319f1b` matching.

     Working theory for why the phase ran this time when it didn't for the RC — not fully certain, but consistent with direct observation: adding `metro.config.js` changes Metro's own config/cache signature, likely invalidating whatever let `EAGER_BUNDLE` pre-satisfy the phase's dependency-analysis check before. Whatever the exact mechanism, the phase executing for real is the fact that matters, and it's now observed directly.

  Build 6 ships with working crash reporting **and** working, uploaded source maps — verified end to end, not assumed at any stage.

- [x] **Does adding `metro.config.js` move the fingerprint?** Measured, not assumed: isolated scratch worktree pinned to `3aacba5`, fingerprint taken *before* adding the standard minimal wiring (`getSentryExpoConfig(__dirname)`) and again *after*, both in the same unchanged environment.

  ```
  before: 2e2051fa61473ed164318cd69a13f435066c2076
  after:  2e2051fa61473ed164318cd69a13f435066c2076
  ```

  Identical, and confirmed as a real non-input rather than a coincidental hash match — the raw fingerprint JSON's only "metro" hits anywhere are `metro-runtime` and `metro-source-map` (unrelated dependency-graph noise); `metro.config.js` itself is never read as a fingerprint source. Consistent with everything else measured tonight: the fingerprint tracks native-runtime-contract inputs (`app.json`, `eas.json`, `package.json` scripts/deps, config plugins, icon assets, autolinking) — `metro.config.js` only affects how JS gets bundled, the same category as `src/`, which also never moves it. **Clear to land pre-launch**, not next-cycle debt.

  > ⚠️ **Worktree gotcha, found while measuring this:** the worktree's baseline fingerprint (`2e2051fa...`) does **not** match the RC's real value (`f4f64031...`) — not a sign of drift, but an artifact of the worktree itself. A `node_modules` symlink reached through a deeply-relative worktree path (e.g. `../../../../../../../Users/.../node_modules/...`) hashes differently than the same files reached directly — every `node_modules`-derived fingerprint source differs, along with `expoAutolinkingIos`/`rncoreAutolinkingIos` (CocoaPods podspec resolution appears to embed the resolved path). Path-dependent, not content-dependent. This is almost certainly also the real explanation for the failed rebundle's 159-module gap above — a second instance of a deeply-nested worktree path producing a misleading number, not evidence of real drift.
  >
  > **The rule that follows:** absolute fingerprints are not comparable across different worktree locations. A before/after delta measured inside one unchanged environment is still valid — that's what both measurements above rely on. Anyone pinning a worktree for a fingerprint check should expect the absolute number to disagree with the real repo and should not read that disagreement as drift.

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

> ⚠️ **Build 6 does not start a new OTA baseline.** Confirmed by measuring the fully merged tree (`ux/founder-review` + `chore/sentry-metro-config`) before it was ever built: fingerprint reads `f4f64031fada4599a686f9e730a099c7cc319f1b`, identical to build 5's. None of tonight's work added a new native dependency — `@expo/ui` (the SwiftUI date picker's native module) was already present in build 5's own fingerprint sources, just never called from any screen until `ux/founder-review` wired it up. Practical consequence: **a single OTA update reaches both build 5 and build 6 installs** — there is no fingerprint boundary between them. Whoever ships the first post-launch update should know this rather than discover it.

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

- [x] **Publish / install / rollback exercised end to end.** Open since Cycle 1, now run for real: on the founder's physical iPhone, against the actual RC build on TestFlight — not a simulator, not an inference from the manifest.

  Fingerprint checked first, as the precondition that decides whether the test means anything: current tree measured at `f4f64031fada4599a686f9e730a099c7cc319f1b`, an exact match to the RC. The freeze held across the entire session.

  Sequence: a single-line, unmissable cosmetic change (`src/app/(tabs)/index.tsx`, home title `"Find a court"` → `"Find a court (OTA TEST)"`) published to the **production** channel, confirmed on-device after force-quit/reopen, then a second update published reverting the title, confirmed gone after a second force-quit/reopen. Both directions observed on hardware, not assumed from a successful `Published!`.

  ```
  cosmetic change   group 40de3078-1f4a-4dfd-8443-8beeb47dfa53
  KNOWN-GOOD BASELINE (original title, "Find a court")
                    group 9cf7977c-ed1f-45a7-adcb-a3de832089a3
                    runtimeVersion f4f64031fada4599a686f9e730a099c7cc319f1b
  ```

  **`9cf7977c-ed1f-45a7-adcb-a3de832089a3` is the group to reach for if production ever needs an emergency rollback** — `eas update:republish --channel production --group 9cf7977c-ed1f-45a7-adcb-a3de832089a3`. It didn't exist before this test: production's channel had never been published to, so there was no prior group for a true `update:republish` to target. This is now that group. Recorded here rather than left in a chat log so whoever is awake at 2am doesn't have to reconstruct which one was safe.

  > ⚠️ **Standing gate, added after this almost went wrong on the very next publish:** before ANY `eas update` publish, verify the publish response's `runtimeVersion` matches the runtime version of the binary being targeted. A mismatch means the update is inert — it will not apply, ever, to that binary — and "nothing happened" on the device will be misread as a failure of whatever was actually being tested, not as what it is: a wrong publish environment. This bit the metro.config.js verification publish directly: it was fired from a worktree with a symlinked `node_modules`, came back with `runtimeVersion: 2e2051fa...` instead of `f4f64031...`, and was caught only by reading the publish response before telling anyone to check their phone — not by anything in the publish path itself asking the question. Documenting the gotcha earlier didn't prevent it; only checking the response did. Make this a gate, not a habit: **read `runtimeVersion` off every publish response and compare it before reporting a publish as ready to test.**

  > **Inert entry, harmless, left as-is:** group `3ef15064-b436-4297-ba97-69ec90091e31` also sits on the production channel's history, published from that contaminated worktree before the fix above — `runtimeVersion 2e2051fa61473ed164318cd69a13f435066c2076`, a value no real device has ever fingerprinted to. `expo-updates` filters by runtime version, so it can never be served to anything; it was superseded on the channel before any device could reach it. Not removed — doing so would be a needless extra operation against production to fix a non-problem. Noted here so nobody finds it in `eas update:list` later and wonders what it was.

- [ ] **Fingerprint inputs frozen since the RC commit.** Checkable, not remembered — diff these seven paths against the RC commit and require an empty result:

  ```bash
  git diff --stat <rc-commit> -- .gitignore eas.json app.json package.json       assets/images/app-icon.png assets/images/mark.png
  # plus: no dependency added, removed or version-changed (autolinking is an input)
  ```

  If any of them moved, the update's runtime version no longer matches the shipped binary and **the update silently will not apply** — the same silent non-application the fingerprint policy causes deliberately, arriving by accident.

  > ⚠️ **`expo prebuild` rewrites `package.json` scripts, and those are fingerprint input.** It changed `"ios": "expo start --ios"` to `"expo run:ios"` during local build work here. Anyone who runs a local build inside the freeze window and commits the result breaks the Following update **off a diff that looks like nothing**. This is now the single most likely way the two-stage plan fails, precisely because it looks harmless.
  >
  > It has already been misdiagnosed once: this exact change was filed as evidence of shared-tree collisions between sessions, because that was the more comfortable explanation.
  >
  > **Traced to source: commit `844f37a`** (the `check-build-env.js` commit) — self-caught, not found by anyone else. It made this exact rewrite while adding an unrelated guard script, before the trap above had been written down. Confirmed via `git log`/`git show` that the rewritten state predates every fingerprint measured or reported since, including the RC's own (`f4f64031`) — so there is no inconsistency between what was reported and what was built, only a mistake that happened earlier than its own warning. **Deliberately not reverted during the freeze**: doing so now would move the fingerprint away from the RC's actual built state and break the Following-update verification the freeze exists to protect. Fix in the next native-build cycle, not this one.

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

  **Source-map upload — split outcome, see §3.** Build 5 (the RC on TestFlight) never had working source maps and can't get them retroactively. But `metro.config.js` is now confirmed working for *updates*: a live OTA-published crash on the founder's device produced a Sentry event resolving to real source, not a bytecode offset. Not yet confirmed inside a real native-compiled build.
  *Environment:* verified on a local debug build (capture/delivery) and on the founder's production-channel device (source-map symbolication for updates). *Retires:* fully retired except confirming `metro.config.js` survives a real Xcode archive — see §3.
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
- **P2, not P3 — upgraded once the retirement condition was checked and turned out already met.** `/api/mobile/cancel` never stamps `cancelled_at` / `cancelled_by`; every booking cancelled through it has both null while other cancellation paths populate them.

  This was written as "audit-trail, not functional", conditioned on whether admin tooling displays the fields — unchecked at the time. It does: `BookingDetailDialog.tsx`'s `buildBookingTimeline()` pushes a "Booking cancelled" entry only `if (booking.cancelledAt)`. **The row is omitted, not blanked** — worse than assumed, because a missing timeline row sits directly beneath a status badge that still reads `CANCELLED`. Badge and timeline contradict each other on the same screen: the badge says this happened, the timeline says it didn't. `cancelled_by` reaches no component anywhere in web.

  *Environment:* production, in the owner-facing tool used specifically to investigate one booking — the moment it most needs to be trustworthy. *Retires when:* mobile launches, not before. Launch is what makes mobile-cancel the primary cancellation path rather than an edge case, and every cancellation from then on produces the self-contradicting screen above. Retroactive: nothing backfills what was never stamped, so bookings cancelled before the fix stay wrong after it ships.

  Backend is designing the fix at the database level rather than the endpoint, because `expire_stale_pending_bookings()` also cancels bookings in SQL on a cron — an endpoint-only fix would miss what becomes the single commonest cancellation path of all. Same reasoning as `078`.
- Three policy names exceed Postgres's 63-byte identifier limit.
  *Environment:* both. *Retires when:* renamed — and the drift check gains a rule flagging any name over 63 bytes, so the next one is caught automatically rather than by memory.
- Migration governance: no ledger, past numbering collisions, baselining deferred.
  *Environment:* process, not code. *Retires when:* a migration ledger exists and baselining is done.
- The 23 React Compiler bail-outs (`expo lint` errors) — those components get no auto-memoization while the rest of the app does.
  *Environment:* both. *Retires when:* `expo lint` reports zero errors.
- **The environment banner needs to stop being a fixed-offset overlay.** It has collided twice — pinned to the top it sat inside the navigation header; pinned to the bottom it sat on the sign-up screen's consent row, partially covering the agreement version string. A fixed offset has no safe edge, because there is no offset that is empty on every screen, so a third position relocates the problem rather than removing it.

  The fix is a slim full-width strip that **reserves layout space**, which cannot overlap by construction. It costs a few points of vertical space on non-production builds only — the right place to spend it. Deliberately not done before the RC: it is P3, invisible to users, and it needs the safe-area handling done properly (a strip consuming `insets.top` must also stop child screens re-applying it) rather than rushed.

  *Environment:* non-production builds only — it renders nothing in production. *Retires when:* the banner reserves layout space instead of overlaying.
- **`/api/mobile/reschedule` says "not found" when it means "already happened".** QA isolated the real variable rather than reporting the symptom: the message doesn't track `status`, it tracks whether `start_time` has passed.

  | State | Message |
  | --- | --- |
  | Future + pending | "Only a confirmed booking can be rescheduled" — specific |
  | Past + pending | "We couldn't find that booking" — generic |
  | **Past + confirmed** | "We couldn't find that booking" — generic, **and the booking exists** |
  | Future + cancelled | "Only a confirmed booking can be rescheduled" — specific |

  The eligibility query appears to filter on `start_time > now()` as part of what counts as "found", so a past booking falls out of the query entirely and reads as nonexistent. **Not a security issue** — QA confirmed separately that another user's booking and a fake id are still correctly distinguished from this. The harm is a user seeing a booking in their own Bookings tab and being told by a different screen that it doesn't exist, which reads as a broken app rather than "that already happened."

  *Environment:* both. *Retires when:* the eligibility check separates the time filter from the existence test, and "already started or ended" gets its own message the way cancelled already has one.

- **`searchPublicProfiles` needs a trigram index.** Founder-reported tap lag on the ranked screens traced to a leading-wildcard `ILIKE` query with no index behind it — measured at 1.4s cold. A debounce (written, tests in progress, held pending App Review per the note above) hides the symptom; it doesn't fix the query. Worth keeping visible on its own rather than letting it disappear once the debounce makes the lag stop being felt.
  *Environment:* both. *Retires when:* a trigram (`pg_trgm`) index backs the search column and the query no longer does a full scan.

## 9. What mobile testing cannot tell you

- **A deep-link pass proves the router works and says nothing about what the database stamps.** `/profile/rank` and `/ranked` both resolve to the Profile tab, so a link-string drift between the two would pass a mobile test identically. Link strings belong to Backend's body-reconciliation sweep, not to a navigation check.
- **Ranked results obtained before the staging repair are void** — staging was running an `apply_ranked_result` variant present in no commit.
- **Before grepping a Metro bundle for anything, confirm the bundle contains your app.** A grep for the DSN returning zero occurrences nearly got reported as "Sentry isn't in the build", when the real cause was that the bundle Metro served contained no app code at all — no `BookingPanel`, no `EnvironmentBanner`. The zero was true about the artifact and false about the world.
