/**
 * Temporary cold-start instrumentation for the splash animation review —
 * not a permanent feature. Logs T0 (module evaluation start, the
 * earliest point JS can mark — as close to "native splash first paints"
 * as anything JS can observe), T1 (SplashOverlay mounts), T2 (session
 * restore resolves, i.e. `settled`), T3 (overlay unmounts) to the
 * console so they can be pulled off a device log across several cold
 * launches.
 *
 * Gated on __DEV__: this needs to stay callable for whoever does the
 * real device timing pass (still open — see the branch's own commit),
 * but a console.log firing on every cold launch in a store build is a
 * real leak, not a hypothetical one — noisy at minimum, and depending
 * on where those logs land, potentially observable. Flag for removal
 * entirely once the timing question is settled for good; this isn't
 * meant to be permanent even in dev.
 */
export const splashTiming = {
  t0: Date.now(),
};

export function markSplashTiming(label: 't1_overlay_mount' | 't2_settled' | 't3_overlay_unmount') {
  if (!__DEV__) return;
  const elapsed = Date.now() - splashTiming.t0;
  console.log(`[splash-timing] ${label} at +${elapsed}ms`);
}
