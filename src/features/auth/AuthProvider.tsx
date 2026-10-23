import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { parseAuthCallback, restoreSession } from '@/features/auth/auth-service';
import { getSupabaseClient } from '@/lib/supabase';

type AuthState =
  | { status: 'loading' }
  | { status: 'configuration-error' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session; recovery: boolean };

type AuthContextValue = {
  state: AuthState;
  retry: () => void;
  finishRecovery: () => void;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let processingRecovery = false;
    let client: ReturnType<typeof getSupabaseClient>;
    try {
      client = getSupabaseClient();
    } catch {
      queueMicrotask(() => {
        if (active) setState({ status: 'configuration-error' });
      });
      return () => {
        active = false;
      };
    }

    const authSubscription = client.auth.onAuthStateChange((event, session) => {
      if (!active || event === 'INITIAL_SESSION') return;
      setState((previous) => {
        if (previous.status === 'loading' || previous.status === 'configuration-error')
          return previous;
        if (!session || event === 'SIGNED_OUT') return { status: 'signed-out' };
        return {
          status: 'signed-in',
          session,
          recovery:
            processingRecovery ||
            event === 'PASSWORD_RECOVERY' ||
            (previous.status === 'signed-in' && previous.recovery),
        };
      });
    });

    async function showLinkFailure() {
      const session = await restoreSession(client).catch(() => null);
      if (!active) return;
      setState((previous) =>
        session
          ? {
              status: 'signed-in',
              session,
              recovery: previous.status === 'signed-in' && previous.recovery,
            }
          : { status: 'signed-out' },
      );
    }

    async function handleLink(url: string) {
      const callback = parseAuthCallback(url);
      if (callback.kind === 'error') {
        await showLinkFailure();
        return;
      }
      try {
        processingRecovery = callback.recovery;
        const { data, error } = await client.auth.setSession({
          access_token: callback.accessToken,
          refresh_token: callback.refreshToken,
        });
        if (error || !data.session) throw error ?? new Error('Missing session');
        if (active)
          setState({ status: 'signed-in', session: data.session, recovery: callback.recovery });
      } catch {
        await showLinkFailure();
      } finally {
        processingRecovery = false;
      }
    }

    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith('lifeopsai://auth/callback')) void handleLink(url);
    });

    void (async () => {
      try {
        const session = await restoreSession(client);
        const initialUrl = await Linking.getInitialURL();
        if (!active) return;
        if (initialUrl?.startsWith('lifeopsai://auth/callback')) {
          await handleLink(initialUrl);
        } else {
          setState(
            session ? { status: 'signed-in', session, recovery: false } : { status: 'signed-out' },
          );
        }
      } catch {
        if (active) setState({ status: 'signed-out' });
      }
    })();

    return () => {
      active = false;
      authSubscription.data.subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, [attempt]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      retry: () => {
        setState({ status: 'loading' });
        setAttempt((current) => current + 1);
      },
      finishRecovery: () =>
        setState((current) =>
          current.status === 'signed-in' ? { ...current, recovery: false } : current,
        ),
      signOut: async () => {
        const { error } = await getSupabaseClient().auth.signOut();
        if (error) throw error;
        setState({ status: 'signed-out' });
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}
