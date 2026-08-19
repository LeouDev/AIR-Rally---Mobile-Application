import { createContext, use, useCallback, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ToastVariant = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; variant: ToastVariant };

type ToastContextValue = {
  show: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

/**
 * The app had no shared success/failure feedback mechanism at all — every
 * screen either rolled its own inline message or, in several places
 * (the Court/Side composer, club join/leave), showed nothing on failure.
 * One toast at the bottom of the screen, auto-dismissing, gives every
 * screen a place to route a message without inventing its own UI.
 */
export function useToast() {
  return use(ToastContext);
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const show = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, variant }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const colorsFor = (variant: ToastVariant) =>
    variant === 'success'
      ? { bg: theme.successSoft, fg: theme.successSoftForeground }
      : variant === 'error'
        ? { bg: theme.destructiveSoft, fg: theme.destructiveSoftForeground }
        : { bg: theme.neutralSoft, fg: theme.neutralSoftForeground };

  return (
    <ToastContext value={{ show }}>
      {children}
      <View pointerEvents="none" style={[styles.stack, { bottom: insets.bottom + Spacing.three }]}>
        {toasts.map((t) => {
          const c = colorsFor(t.variant);
          return (
            <View
              key={t.id}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[styles.toast, { backgroundColor: c.bg, borderColor: c.bg }]}>
              <ThemedText type="smallBold" style={{ color: c.fg }}>
                {t.message}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </ToastContext>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
  toast: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    maxWidth: 480,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
