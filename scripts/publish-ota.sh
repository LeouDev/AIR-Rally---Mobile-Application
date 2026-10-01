#!/usr/bin/env bash
# Publish origin/main to the production channel over the air, with the
# checks in AGENTS.md "Publishing" enforced instead of remembered.
#
#   scripts/publish-ota.sh "What changed, in a few words"
#   DRY_RUN=1 scripts/publish-ota.sh "..."   # every check, no publish
#
# Run it from any checkout: it publishes from its own throwaway worktree at
# origin/main with real dependencies, so the tree is clean, on main, free of
# local .env files, and fingerprinted the way EAS builds are (a symlinked
# node_modules hashes differently). It refuses unless a finished App Store
# build has the same runtime — an update for a runtime nobody has reaches
# nobody — and ends by checking what the production manifest really serves.
set -euo pipefail

message="${1:?usage: scripts/publish-ota.sh \"<what changed>\"}"
project_id=c802dbac-e219-48e5-8216-0f64bd45f8fe # app.json extra.eas.projectId
die() { echo "BLOCKED: $*" >&2; exit 1; }
json() { node -e "const j = JSON.parse(process.argv[1]); console.log($1)" "$2"; }

repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
work=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$work/main" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

git -C "$repo" fetch -q origin main
git -C "$repo" worktree add -q --detach "$work/main" origin/main
cd "$work/main"
sha=$(git rev-parse --short HEAD)
echo "origin/main is $(git log -1 --format='%h %s')"
npm ci --no-audit --no-fund --loglevel=error

runtime=$(json 'j.hash' "$(npx expo-updates fingerprint:generate --platform ios 2>/dev/null)")
builds=$(eas build:list --platform ios --status finished --distribution store \
  --runtime-version "$runtime" --limit 1 --json --non-interactive)
[ "$(json 'j.length' "$builds")" -gt 0 ] ||
  die "no App Store build has runtime $runtime, so this update would reach nobody. Something native changed on main; it needs a new build."
echo "Runtime $runtime is store build $(json 'j[0].appVersion + " (" + j[0].appBuildVersion + ")"' "$builds")"

live=$(eas update:list --branch production --platform ios --limit 1 --json --non-interactive)
rollback=$(json '(j.currentPage ?? j)[0]?.group ?? "none"' "$live")
if [ "${DRY_RUN:-}" = 1 ]; then
  echo "Dry run: would publish \"$message [$sha]\". Production is on group $rollback."
  exit 0
fi

result=$(eas update --branch production --platform ios --environment production \
  --non-interactive --json --message "$message [$sha]")
update_id=$(json '(Array.isArray(j) ? j : [j]).find((u) => u.platform === "ios").id' "$result")
group=$(json '(Array.isArray(j) ? j : [j]).find((u) => u.platform === "ios").group' "$result")

for _ in 1 2 3 4 5 6; do
  served=$(curl -s "https://u.expo.dev/$project_id" -H 'expo-platform: ios' \
    -H "expo-runtime-version: $runtime" -H 'expo-channel-name: production' \
    -H 'expo-protocol-version: 1' -H 'accept: multipart/mixed' | grep -o '"id":"[^"]*"' | head -1 || true)
  [ "$served" = "\"id\":\"$update_id\"" ] && break
  sleep 5
done
[ "$served" = "\"id\":\"$update_id\"" ] ||
  die "published group $group, but production serves ${served:-nothing} instead of $update_id. Check before calling it live."

echo "Live: group $group, update $update_id, runtime $runtime, commit $sha."
echo "Roll back with: eas update:republish --group $rollback"
