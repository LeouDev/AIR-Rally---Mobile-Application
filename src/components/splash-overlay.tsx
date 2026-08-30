import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Appearance, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';

import { hasSeenSplashIntro, markSplashIntroSeen } from '@/lib/splash-preference';
import { markSplashTiming } from '@/lib/splash-timing';

/**
 * The app-open animation, ported from the design handoff's
 * splash-standalone.html under one hard constraint: no new native
 * dependencies (react-native-reanimated + expo-image only). That rules
 * out a live port outright — the original is 15 stacked <img> layers
 * inside `transform-style:preserve-3d`, masked specular sweeps, and
 * blurred radial gradients, none of which RN's transform union or
 * plain Views can express. See splash-frame-source.md for what this
 * traded away and why.
 *
 * The rotation is pre-rendered: 13 JPEG frames of the actual page,
 * screenshotted at paused points along the real cubic-bezier(.16,.86,
 * .28,1) easing (denser early, where nearly all the visible motion
 * happens), each one a full opaque scene — background, glow, mark,
 * and (from frame 9 on) the wordmark, all baked in together. Cross-
 * fading opaque layers in sequence needs no alpha channel and no
 * masking; each new frame simply covers the one before it.
 *
 * Dropped entirely: the specular sweep's true masked motion (traded
 * for a few of the later frames catching the highlight mid-pass,
 * which reads as a flicker of light rather than a sweep), and the
 * idle float's real Y-axis wobble (a flat baked sprite doing a fake
 * 3D tilt looked worse than holding still, so the settled frame just
 * holds during the idle wait instead of looping).
 */

const FRAMES: ImageSourcePropType[] = [
  require('@/assets/images/splash/intro-01.jpg'),
  require('@/assets/images/splash/intro-02.jpg'),
  require('@/assets/images/splash/intro-03.jpg'),
  require('@/assets/images/splash/intro-04.jpg'),
  require('@/assets/images/splash/intro-05.jpg'),
  require('@/assets/images/splash/intro-06.jpg'),
  require('@/assets/images/splash/intro-07.jpg'),
  require('@/assets/images/splash/intro-08.jpg'),
  require('@/assets/images/splash/intro-09.jpg'),
  require('@/assets/images/splash/intro-10.jpg'),
  require('@/assets/images/splash/intro-11.jpg'),
  require('@/assets/images/splash/intro-12.jpg'),
  require('@/assets/images/splash/intro-13.jpg'),
];

// Milliseconds from mount, matching exactly when each frame was
// captured from the live page (see scripts referenced in
// splash-frame-source.md) — NOT evenly spaced. The eased rotation
// does almost all its visible motion in the first ~500ms.
const FRAME_TIMES_MS = [220, 260, 300, 350, 420, 520, 680, 950, 1400, 1550, 1650, 1770, 1850];
const INTRO_DURATION_MS = FRAME_TIMES_MS[FRAME_TIMES_MS.length - 1];

// The design's own reduced-motion collapse: 0.28s, no per-frame
// stepping — straight to the settled frame. Belt-and-suspenders: every
// withTiming() call below ALSO gets reanimated's own default reduced-
// motion handling (getReduceMotionForAnimation() in its animation/util,
// driven by the same system setting useReducedMotion() reads) — that
// snaps the value straight to its target with no animation at all,
// which is usually faster than this 280ms even runs. This constant
// stays as the deliberate, visible fallback for the (rare) case that
// diverges — e.g. the setting flips mid-session and reanimated's
// module-scope snapshot doesn't — not because either path alone is
// trusted to be sufficient.
const REDUCED_MOTION_DURATION_MS = 280;

const EXIT_DURATION_MS = 420;

// Matches app.json's expo-splash-screen colors exactly — the native
// splash's own background, read via the OS's REAL appearance (not
// this app's useColorScheme(), which is hardcoded to 'light' — see
// hooks/use-color-scheme.ts). The native splash renders before any JS
// runs, so it always follows the device's actual setting regardless
// of what the app forces once JS takes over.
const NATIVE_SPLASH_BG = { light: '#f6f1e8', dark: '#0b1d36' } as const;
const DESIGN_BG = '#0a1524';

export function SplashOverlay({ ready, onFinished }: { ready: boolean; onFinished: () => void }) {
  const reducedMotion = useReducedMotion();
  const [speed, setSpeed] = useState<1 | 0.5>(1);
  const introDoneRef = useRef(false);
  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  const progress = useSharedValue(0); // 0..introDurationMs (post-speed-scale)
  const exitProgress = useSharedValue(0); // 0..1
  const nativeBgOpacity = useSharedValue(1);

  // Temporary — see splash-timing.ts. T1 on mount, T3 (the cleanup) only
  // fires when React actually removes this component from the tree —
  // the real "unmounts" moment 32 asked for, not just when the exit
  // animation's own callback fires.
  useEffect(() => {
    markSplashTiming('t1_overlay_mount');
    return () => markSplashTiming('t3_overlay_unmount');
  }, []);

  useEffect(() => {
    let cancelled = false;
    hasSeenSplashIntro().then((seen) => {
      if (!cancelled) setSpeed(seen ? 0.5 : 1);
      void markSplashIntroSeen();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startExit = () => {
    'worklet';
    // The design's own reduced-motion rule collapses EVERY animation on
    // the page to 0.28s, not just the intro — the exit zoom-fade is no
    // exception, so this reads `reducedMotion` too rather than always
    // using the full exit duration.
    const duration = reducedMotion ? REDUCED_MOTION_DURATION_MS : EXIT_DURATION_MS;
    exitProgress.value = withTiming(1, { duration, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(onFinished)();
    });
  };

  const handleIntroDone = () => {
    introDoneRef.current = true;
    if (readyRef.current) startExit();
    // else: holds on the last frame (progress capped at its max) until
    // `ready` flips — see the effect below.
  };

  useEffect(() => {
    if (reducedMotion) {
      nativeBgOpacity.value = withTiming(0, { duration: REDUCED_MOTION_DURATION_MS, easing: Easing.out(Easing.quad) });
      progress.value = withTiming(REDUCED_MOTION_DURATION_MS, { duration: REDUCED_MOTION_DURATION_MS, easing: Easing.linear }, (done) => {
        if (done) runOnJS(handleIntroDone)();
      });
      return;
    }
    // `speed` scales WALL-CLOCK time only (0.5 = the design's own
    // `--sp: 0.5`, half the real duration) — the value `progress`
    // counts up to always stays INTRO_DURATION_MS, the same fixed
    // reference scale every <Frame> below compares against via its own
    // unscaled start/end from FRAME_TIMES_MS. Scaling the target value
    // itself instead of the wall-clock duration would leave every frame
    // past the halfway point unreachable at speed 0.5 — progress would
    // simply never count that high.
    const realDurationMs = INTRO_DURATION_MS * speed;
    nativeBgOpacity.value = withTiming(0, { duration: Math.min(400 * speed, realDurationMs), easing: Easing.out(Easing.quad) });
    progress.value = withTiming(INTRO_DURATION_MS, { duration: realDurationMs, easing: Easing.linear }, (done) => {
      if (done) runOnJS(handleIntroDone)();
    });
    // Deliberately once — speed is fixed by the time this runs (the
    // AsyncStorage read above resolves before the first paint that
    // matters visually), and reducedMotion doesn't change mid-mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, reducedMotion]);

  // The moment startup finishes AFTER the intro already finished
  // (the common case on anything but a very slow cold start) — fire
  // the exit immediately instead of waiting for a re-render to notice.
  useEffect(() => {
    if (ready && introDoneRef.current) startExit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const nativeBgStyle = useAnimatedStyle(() => ({ opacity: nativeBgOpacity.value }));
  const exitStyle = useAnimatedStyle(() => ({
    opacity: interpolate(exitProgress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(exitProgress.value, [0, 1], [1, 1.14], Extrapolation.CLAMP) }],
  }));

  const scheme = Appearance.getColorScheme();
  const nativeColor = scheme === 'dark' ? NATIVE_SPLASH_BG.dark : NATIVE_SPLASH_BG.light;

  if (reducedMotion) {
    return (
      <Animated.View style={[styles.fill, exitStyle]} pointerEvents="none">
        <Animated.View style={[styles.fill, { backgroundColor: nativeColor }, nativeBgStyle]} />
        <ReducedMotionFrame progress={progress} durationMs={REDUCED_MOTION_DURATION_MS} />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.fill, exitStyle]} pointerEvents="none">
      <Animated.View style={[styles.fill, { backgroundColor: nativeColor }, nativeBgStyle]} />
      <View style={[styles.fill, { backgroundColor: DESIGN_BG }]} />
      {FRAMES.map((source, i) => (
        <Frame key={i} source={source} progress={progress} start={i === 0 ? 0 : FRAME_TIMES_MS[i - 1]} end={FRAME_TIMES_MS[i]} />
      ))}
    </Animated.View>
  );
}

function Frame({
  source,
  progress,
  start,
  end,
}: {
  source: ImageSourcePropType;
  progress: SharedValue<number>;
  start: number;
  end: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [start, end], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={[styles.fill, style]}>
      <Image source={source} style={styles.fill} contentFit="cover" />
    </Animated.View>
  );
}

function ReducedMotionFrame({ progress, durationMs }: { progress: SharedValue<number>; durationMs: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, durationMs], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={[styles.fill, style]}>
      <Image source={FRAMES[FRAMES.length - 1]} style={styles.fill} contentFit="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...(StyleSheet.absoluteFill as object),
  },
});
