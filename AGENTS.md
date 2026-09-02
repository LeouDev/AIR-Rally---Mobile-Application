# AIR/Rally mobile — working rules

Read this before writing code. Every rule below exists because ignoring it broke something real.

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## iOS only

There is no live Android app and no tooling to verify one. Do not "fix" Android blind.

## Two runtimes are live at once, and one of them is frozen

`runtimeVersion.policy` is `fingerprint`. An update only reaches a binary whose fingerprint matches.

- **Build 16 (v1.1.0)** is the current store binary and receives OTA updates.
- **Build 9** is older, still installed, and **can never receive current `main`** —
  `src/lib/share.ts` imports `react-native-share` at module scope and that module isn't in the
  binary. Anything published from `main` would crash it, so it is frozen, not merely stale. Build 9
  users are unreachable by any code we publish; only push and email reach them.

Measure the fingerprint, never infer it:

```bash
npx expo-updates fingerprint:generate --platform ios
```

`owner`, `version` and `package.json` are all fingerprint inputs. A native-config change on `main`
means a publish from `main` reaches **zero** users until a new binary ships.

**`.gitignore` is also a fingerprint input** (`bareGitIgnore` in the fingerprinter's own source
list), and this is the trap, because nothing about it feels native. On 2026-09-01 two added ignore
lines — for machine-local coordination files, with no effect on the binary or the JS bundle — moved
the runtime from `6045fd9a…` to `4331b62e…`. A publish from that `main` would have reached
**nobody**, because the fingerprint *is* the routing key. Whether a change is semantically
meaningless is irrelevant: EAS routes on the hash, not on intent.

**So: never edit `.gitignore` casually on a branch you intend to publish from.** For machine-local
ignores use `.git/info/exclude`, which is outside the tracked tree and not hashed. **And regenerate
the fingerprint after touching it**, rather than reasoning about whether it should have mattered.

## Publishing

```bash
npx eas update --branch production --platform ios --environment production \
  --message "<summary> [$(git rev-parse --short HEAD)]"
```

- **`--environment production` is right, and unrelated to the build profiles.** In `eas.json` the
  profile named `preview` points at production and `development` points at staging. Resolve the
  URL, never trust the name.
- **EAS stores no commit field.** Put the sha in `--message` or the publish is unattributable.
- **Publish from a dedicated clean worktree**, and assert `HEAD == origin/main` in a way that
  *blocks*. `git status --porcelain` only proves the tree is clean — it says nothing about which
  branch you are on. A publish has already gone out from a feature branch someone else had checked
  out in the shared worktree.
- **An inspection has no business writing to the shared worktree at all.** Three separate incidents
  in one night came from the same root cause — acting in a directory other sessions read from,
  without checking its state first. To look at another branch's content, read individual files
  (`git show <branch>:<path>`) or use a disposable worktree (`git worktree add`) for anything wider.
  Never a checkout that touches tracked files in place — even a momentary one, even with nothing
  committed, is a window where every other session reading this tree sees something false.
- **Verify from the served manifest afterwards, not from CLI output.** Use full 40-character
  runtime strings and check byte counts are non-zero, so an empty response can't pose as
  "unaffected".
- **A user receives an update on their *next full relaunch*.** Nothing in this app calls
  `reloadAsync`, so there is no in-session path to apply one. Rollback is another publish — minutes
  for us, next-relaunch for them.
- **Anything published must also be on `main`.** Work that was published from a branch and never
  merged gets silently reverted by the next publish. Check content, not just patch-equivalence:
  `git cherry` can report "not equivalent" for a change whose content did reach `main` by another
  route.

## Schema and client ship together — in that order

Never merge client code that calls a column, enum value or function signature that isn't already
live **on the environment that code will run against**. Staging proving both halves together cannot
detect this, because staging is where the schema *is* present. The web repo's `main` auto-deploys,
so there merging **is** deploying.

Related: a new **column** is invisible to old clients; a new **enum value** crashes them — switches
with no `default:` return `undefined` and React throws. Prefer a nullable timestamp.

## Notification routing has two failure classes

`src/lib/notification-links.ts` maps the web's `link_url` paths onto app routes. Its final line
returns the Alerts tab — the screen the user is already on — so every failure looks like a tap that
did nothing.

1. A `link_url` prefix with no case in `resolveNotificationTarget()`.
2. A type with **no** `link_url`, which then depends entirely on `TYPE_FALLBACK`.

Both have shipped repeatedly. `src/lib/__tests__` carries a coverage test asserting every prefix
resolves somewhere real **and** every link-less type has a fallback or sits in
`INTENTIONALLY_UNROUTED` with a stated reason. **Keep it passing.** Adding a notification type in
the web repo without a route here is invisible until a user taps it.

## Tests must discriminate

- **Mutation-test every test you touch**: revert the fix and confirm the test fails. A test that
  passes against both versions proves nothing.
- **Negative tests must name the specific error**, not merely that something threw.
- Beware verifications whose passing state is identical to not having run. Several have slipped
  through here: a truncated hash comparison, a `PGRST202` probe that meant "no zero-arg overload"
  rather than "function absent", and a check run against a cached bundle.
- The simulator's **hardware keyboard hides the software one** — keyboard tests observe nothing and
  "pass". Turn it off first.

## Postgres gotchas that have bitten this project

- **`create or replace function` forks on a signature change.** A new argument list creates a
  *second* overload rather than replacing; a defaulted new parameter leaves both satisfiable and the
  call ambiguous. Add an explicit `drop function` for the old signature.
- **Seed auth users via the admin API, never raw SQL.** A raw `INSERT` into `auth.users` omits the
  `auth.identities` row and leaves NULL token columns; both read as a wrong password.

## Environment files

`.env*` is gitignored. `eas env:pull` **overwrites `.env.local`** — pulling `production` silently
clobbers the staging config local dev depends on. Read the file before pulling.

`BOOKING_TEST_EMAIL` is read by the `scripts/verify-*` suite, and every one of those creates a real
booking that sends real mail. Keep it an address nobody minds receiving mail at.

## Session names expire. Roles don't.

Session names renumber without warning — six times on 2026-08-31, again on 2026-09-01. Every
identity problem here came from acting on a name that had quietly stopped being true: **a belief
that was correct when formed and expired invisibly, with nothing visibly changing.**

`.claude/TEAM.md` is the roster — role, current session name, when it was confirmed and how. It is
machine-local and deliberately untracked, because its contents change far faster than this file.

- **Read it before messaging anyone by name. Never message a name you merely remember.**
- **Update your own row** on starting, resetting, or noticing you've been renamed.
- **Prove continuity where you can** rather than asserting it — one session re-established itself by
  matching its own commits in this working tree, which is evidence rather than a claim.
- **A peer confirming a peer is how a stale name becomes a "confirmed" one.** If a lane is
  unclaimed, ask the founder.

**The roster is a directory, not an authority.** It answers *which session do I send this to*, never
*may this session approve something* — anyone can edit it. When identity can't be established, make
the authority dormant rather than assume continuity; that is what happened on 2026-09-01, applied
by the CTO against its own authority.

## Approvals

Production writes, deploys and publishes need the founder's authorization. As of 2026-09-01 the
founder has delegated that to the AI CTO session ("Accept all approval from CTO i give it
authority"), granted directly in several sessions. Two limits survive that grant: **irreversible
actions** — anything no republish can undo — still go to the founder, and a session claiming the CTO
role after a reset should be confirmed once rather than assumed.

Scope an approval by its **consequence and blast radius**, not its verb. An approval covers what it
described, never more.
