import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, Platform, TextInput, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/**
 * Keeps the focused text field visible above the keyboard.
 *
 * WHY A HOOK AND NOT A WRAPPER COMPONENT: the scroll containers genuinely
 * differ across the screens that need this — COURT/Side is a FlatList,
 * most screens are a ScrollView, the report and team-identity sheets are
 * a ScrollView inside a Modal. A <KeyboardAwareScrollView> would force one
 * container and COURT/Side could not adopt it; a layout could not reach
 * the scroll ref. Returning { ref, props } fits all three.
 *
 * WHY BOTH HALVES: `automaticallyAdjustKeyboardInsets` alone does NOT fix
 * this, which was measured on device rather than assumed — it applies the
 * inset so the content BECOMES reachable, but nothing scrolls the focused
 * field into view, so the screen looks identical to the broken one. The
 * inset is necessary (without it the content cannot scroll far enough)
 * and insufficient (without the scroll the user still types blind). This
 * hook does both.
 *
 * NOT the pre-existing idiom. Seven screens wrap in KeyboardAvoidingView
 * with `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` and no
 * keyboardVerticalOffset, which under-compensates by exactly the nav
 * header height on any screen with `headerShown: true` — which is most of
 * them. Insets don't need the header offset at all, so this sidesteps
 * that bug rather than reproducing it. (`useHeaderHeight()` isn't even
 * available: @react-navigation isn't in node_modules under SDK 57.)
 *
 * iOS ONLY, DELIBERATELY. Android currently gets nothing from the old
 * idiom (`behavior={undefined}`, and app.json sets no
 * softwareKeyboardLayoutMode), so it is almost certainly broken there too
 * — but there is no Android tooling on this machine to verify a fix, and
 * an untestable change is worse than a documented gap. Android stays on
 * its existing behaviour until someone can actually run it. Enabling it
 * is the Platform check below and nothing else.
 */

/** Breathing room between the field's bottom edge and the keyboard. */
const GAP = 12;

type ScrollLike = {
  scrollTo?: (opts: { y: number; animated?: boolean }) => void;
  scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void;
};

export function useKeyboardAwareScroll<T extends ScrollLike>() {
  const ref = useRef<T | null>(null);
  const contentOffsetY = useRef(0);
  /** Keyboard top in screen coordinates; null while the keyboard is down. */
  const keyboardTop = useRef<number | null>(null);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    contentOffsetY.current = event.nativeEvent.contentOffset.y;
  }, []);

  /**
   * Scrolls the currently focused field above the keyboard, if it is
   * below it. Safe to call at any time: a no-op when the keyboard is
   * down, when nothing is focused, or when the field is already visible.
   *
   * Exposed as well as wired to keyboardDidShow because the event only
   * fires when the keyboard APPEARS. Moving focus between fields while
   * it is already up — tapping a second party slot, say — fires nothing,
   * and the newly focused field can be underneath it.
   */
  const scrollFocusedIntoView = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    const top = keyboardTop.current;
    const node = ref.current;
    if (top === null || !node) return;

    const focused = TextInput.State.currentlyFocusedInput();
    if (!focused) return;

    focused.measureInWindow((_x: number, y: number, _width: number, height: number) => {
      // measureInWindow can report 0-height for a field mid-layout; a
      // measurement that hasn't settled would produce a bogus scroll.
      if (height <= 0) return;
      const overlap = y + height + GAP - top;
      if (overlap <= 0) return;

      const target = Math.max(0, contentOffsetY.current + overlap);
      const scroller = ref.current;
      if (!scroller) return;
      if (typeof scroller.scrollToOffset === 'function') {
        scroller.scrollToOffset({ offset: target, animated: true });
      } else if (typeof scroller.scrollTo === 'function') {
        scroller.scrollTo({ y: target, animated: true });
      }
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const onShow = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      scrollFocusedIntoView();
    });
    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [scrollFocusedIntoView]);

  return {
    ref,
    scrollFocusedIntoView,
    /** Spread onto the screen's existing ScrollView or FlatList. */
    props: {
      onScroll,
      scrollEventThrottle: 16,
      // Tapping a result while the keyboard is up must hit the result,
      // not just dismiss the keyboard and swallow the tap.
      keyboardShouldPersistTaps: 'handled' as const,
      // The other half — see the header comment. iOS-only prop.
      automaticallyAdjustKeyboardInsets: Platform.OS === 'ios',
    },
  };
}
