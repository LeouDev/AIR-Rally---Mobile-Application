/**
 * Temporary cold-start instrumentation for the splash animation review —
 * not a permanent feature. Logs T0 (module evaluation start, the
 * earliest point JS can mark — as close to "native splash first paints"
 * as anything JS can observe), T1 (SplashOverlay mounts), T2 (session
 * restore resolves, i.e. `settled`), T3 (overlay unmounts) to the
 * console so they can be pulled off a device log across several cold
 * launches. Flag for removal once the timing question is settled —
 * this isn't meant to ship logging on every real user's launch forever.
 */
export const splashTiming = {
  t0: Date.now(),
};

export function markSplashTiming(label: 't1_overlay_mount' | 't2_settled' | 't3_overlay_unmount') {
  const elapsed = Date.now() - splashTiming.t0;
  console.log(`[splash-timing] ${label} at +${elapsed}ms`);
}
