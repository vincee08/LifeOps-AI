import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { LoadingState } from '@/components/ui/StateView';
import { useAuth } from '@/features/auth/AuthProvider';

export default function AuthCallbackScreen() {
  const { state } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'signed-in') router.replace(state.recovery ? '/reset-password' : '/');
  }, [state, router]);

  return (
    <Screen>
      {state.status === 'loading' ? (
        <LoadingState label="Opening your account link…" />
      ) : state.status === 'signed-in' ? (
        <LoadingState label="Opening your account…" />
      ) : (
        <>
          <AppText variant="title">Link could not be used</AppText>
          <AppText tone="mutedText">
            The link may be invalid or expired. Request a new email and try again.
          </AppText>
          <AppButton label="Go to sign in" onPress={() => router.replace('/sign-in')} />
        </>
      )}
    </Screen>
  );
}
