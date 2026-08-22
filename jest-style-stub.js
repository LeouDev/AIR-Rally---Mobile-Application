/**
 * Metro compiles `import '@/global.css'` (the web target's font-family
 * custom properties, imported by constants/theme.ts) into a style
 * injection; Jest has no such transformer and parses the file as
 * JavaScript, which fails on the first selector. Component tests only
 * need the module to resolve — the tokens they actually read are the JS
 * values in constants/theme.ts, not the CSS variables, which are web-only.
 */
module.exports = {};
