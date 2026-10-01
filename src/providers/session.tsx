import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { cancelBookingReminders } from '@/lib/booking-reminders';
import { registerDevicePushToken, unregisterDevicePushToken } from '@/lib/push';
import { AUTH_STORAGE_KEY, supabase } from '@/lib/supabase';
import { refreshUnreadCount } from '@/lib/unread';

type SessionContextValue = {
  session: Session | null;
  /** False until the persisted session has been restored from storage —
   * routing decisions before that would bounce every cold start through
   * the sign-in screen. */
  isLoaded: boolean;
  /**
   * Null while unknown/not applicable (no session, or not checked yet).
   * True means this signed-in user has never accepted the User
   * Agreement — true for every first-time Google/Facebook arrival, since
   * OAuth signs a user in without ever showing the checkbox the manual
   * sign-up form gates on. The root layout uses this to route a
   * newly-OAuth'd user to (auth)/complete-signup instead of straight
   * into the app, mirroring the web's /auth/callback redirect for the
   * same case.
   */
  needsAgreement: boolean | null;
  /** Called once the complete-signup screen's RPC succeeds — flips
   * needsAgreement locally instead of a round-trip re-check. */
  markAgreementAccepted: () => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  isLoaded: false,
  needsAgreement: null,
  markAgreementAccepted: () => {},
  signOut: async () => {},
});

export function useSession() {
  return use(SessionContext);
}

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

/** Accepting the User Agreement is permanent, so once seen it's cached per
 * user — every cold start used to hold the splash on this network check. */
const agreementKey = (userId: string) => `agreement-accepted:${userId}`;

/**
 * The session supabase-js still holds in storage but won't return: offline,
 * with an expired access token, getSession() fails its refresh and answers
 * "no session" — while keeping the session and refreshing it as soon as the
 * network is back (TOKEN_REFRESHED, or SIGNED_OUT if the refresh token turns
 * out to be dead). Without this a player opening the app at a court with no
 * signal got the sign-in screen.
 */
async function readStoredSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Session) : null;
    return stored?.user && stored.refresh_token ? stored : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [needsAgreement, setNeedsAgreement] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data, error }) => {
      let restored = data.session;
      if (!restored && isNative && error && isAuthRetryableFetchError(error)) {
        restored = await readStoredSession();
      }
      setSession(restored);
      setIsLoaded(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      // getSession() above answers the initial state; INITIAL_SESSION repeats
      // it without the offline fallback, and would undo it.
      if (event === 'INITIAL_SESSION') return;
      setSession(next);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (!userId) {
      setNeedsAgreement(null);
      return;
    }
    let cancelled = false;
    setNeedsAgreement(null);
    (async () => {
      if ((await AsyncStorage.getItem(agreementKey(userId))) === '1') {
        if (!cancelled) setNeedsAgreement(false);
        return;
      }
      const { count, error } = await supabase
        .from('agreement_acceptances')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (cancelled) return;
      // A read failure must never strand a real user behind a screen
      // they can't get past — treat it as "already agreed" (the manual
      // sign-up path, the overwhelming majority of accounts, always has
      // a real row anyway) rather than blocking indefinitely. Only a real
      // answer is cached.
      setNeedsAgreement(error ? false : count === 0);
      if (!error && count !== 0) void AsyncStorage.setItem(agreementKey(userId), '1');
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  // Per-device, not per-event: registration is idempotent (the RPC
  // upserts on token), so once per signed-in user id is enough.
  const registeredForUserId = useRef<string | null>(null);
  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (!userId || registeredForUserId.current === userId) return;
    registeredForUserId.current = userId;
    // Registers only if notifications are already allowed — the asking
    // happens later, at a moment that explains it (see lib/push.ts).
    void registerDevicePushToken();
  }, [session?.user.id]);

  const signOut = async () => {
    // Token cleanup needs the session to still be alive; losing the race
    // is fine — the push webhook prunes DeviceNotRegistered tokens too.
    await unregisterDevicePushToken();
    registeredForUserId.current = null;
    await supabase.auth.signOut();
  };

  // However the session ends — this button, a sign-out on the web, an
  // expired refresh token — nothing of that account should outlive it on
  // this phone: its unread badge on the app icon, or its booking
  // reminders. Idempotent, so it simply runs whenever nobody is signed in.
  useEffect(() => {
    if (!isLoaded || session?.user.id) return;
    void refreshUnreadCount(null);
    void cancelBookingReminders();
  }, [isLoaded, session?.user.id]);

  const markAgreementAccepted = () => {
    setNeedsAgreement(false);
    if (session?.user.id) void AsyncStorage.setItem(agreementKey(session.user.id), '1');
  };

  return (
    <SessionContext value={{ session, isLoaded, needsAgreement, markAgreementAccepted, signOut }}>
      {children}
    </SessionContext>
  );
}
