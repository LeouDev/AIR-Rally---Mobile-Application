import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { registerDevicePushToken, unregisterDevicePushToken } from '@/lib/push';
import { supabase } from '@/lib/supabase';

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

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [needsAgreement, setNeedsAgreement] = useState<boolean | null>(null);
  const pushTokenRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoaded(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
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
    supabase
      .from('agreement_acceptances')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .then(({ count, error }) => {
        if (cancelled) return;
        // A read failure must never strand a real user behind a screen
        // they can't get past — treat it as "already agreed" (the manual
        // sign-up path, the overwhelming majority of accounts, always has
        // a real row anyway) rather than blocking indefinitely.
        setNeedsAgreement(error ? false : count === 0);
      });
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
    registerDevicePushToken().then((token) => {
      pushTokenRef.current = token;
    });
  }, [session?.user.id]);

  const signOut = async () => {
    // Token cleanup needs the session to still be alive; losing the race
    // is fine — the push webhook prunes DeviceNotRegistered tokens too.
    if (pushTokenRef.current) {
      await unregisterDevicePushToken(pushTokenRef.current);
      pushTokenRef.current = null;
    }
    registeredForUserId.current = null;
    await supabase.auth.signOut();
  };

  const markAgreementAccepted = () => setNeedsAgreement(false);

  return (
    <SessionContext value={{ session, isLoaded, needsAgreement, markAgreementAccepted, signOut }}>
      {children}
    </SessionContext>
  );
}
