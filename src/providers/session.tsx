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
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  isLoaded: false,
  signOut: async () => {},
});

export function useSession() {
  return use(SessionContext);
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
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

  return <SessionContext value={{ session, isLoaded, signOut }}>{children}</SessionContext>;
}
