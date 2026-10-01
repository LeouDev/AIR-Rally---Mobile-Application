/**
 * Neither of these reaches the binary, yet each has moved the runtime and
 * stranded every update published after it: two .gitignore lines on
 * 2026-09-01 (6045fd9a → 4331b62e), and `expo prebuild` rewriting package.json
 * scripts. Native config, config plugins and dependencies still count.
 *
 * @type {import('expo/fingerprint').Config}
 */
module.exports = {
  sourceSkips: ['GitIgnore', 'PackageJsonScriptsAll'],
};
