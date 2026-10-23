import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/StateView';
import { useAuth } from '@/features/auth/AuthProvider';
import { loadProfile, updateProfile, type Profile } from '@/features/settings/profile-service';
import { useAppTheme } from '@/hooks/useAppTheme';

export function SettingsScreen() {
  const theme = useAppTheme();
  const { state, signOut } = useAuth();
  const userId = state.status === 'signed-in' ? state.session.user.id : null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void loadProfile(userId)
      .then((result) => {
        if (!active) return;
        setProfile(result);
        setDisplayName(result.display_name ?? '');
        setTimezone(result.timezone);
        setError('');
      })
      .catch(() => {
        if (active) setError('Profile could not be loaded. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  async function save() {
    if (!userId || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await updateProfile(userId, displayName, timezone);
      setProfile(result);
      setDisplayName(result.display_name ?? '');
      setTimezone(result.timezone);
      setNotice('Profile saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Profile could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function leave() {
    if (signingOut) return;
    setSigningOut(true);
    setError('');
    try {
      await signOut();
    } catch {
      setError('Could not sign out. Check your connection and try again.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <AppText variant="display">Settings</AppText>
        {loading || (profile !== null && profile.id !== userId) ? (
          <LoadingState label="Loading your profile…" />
        ) : !profile ? (
          <ErrorState
            description={error || 'Profile is unavailable.'}
            onRetry={() => {
              setLoading(true);
              setReloadKey((n) => n + 1);
            }}
          />
        ) : (
          <>
            <View style={{ gap: theme.spacing.sm }}>
              <AppText>Display name</AppText>
              <TextInput
                accessibilityLabel="Display name"
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={80}
                editable={!saving}
                autoCapitalize="words"
                style={{
                  minHeight: 48,
                  padding: theme.spacing.md,
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: theme.radius.md,
                }}
              />
            </View>
            <View style={{ gap: theme.spacing.sm }}>
              <AppText>Timezone</AppText>
              <TextInput
                accessibilityLabel="Timezone"
                value={timezone}
                onChangeText={setTimezone}
                editable={!saving}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  minHeight: 48,
                  padding: theme.spacing.md,
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: theme.radius.md,
                }}
              />
              <AppText tone="mutedText">Use an IANA timezone, such as Asia/Manila.</AppText>
            </View>
            <AppText>Currency: {profile.currency_code}</AppText>
            {error ? (
              <AppText tone="danger" accessibilityRole="alert">
                {error}
              </AppText>
            ) : null}
            {notice ? <AppText accessibilityRole="alert">{notice}</AppText> : null}
            <AppButton
              label="Save profile"
              submitting={saving}
              disabled={signingOut}
              onPress={() => void save()}
            />
          </>
        )}
        <AppButton
          label="Sign out"
          variant="secondary"
          submitting={signingOut}
          disabled={saving}
          onPress={() => void leave()}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
