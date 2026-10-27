import { useEffect, useState } from 'react';
import { AppState, KeyboardAvoidingView, Linking, Platform, TextInput, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/StateView';
import { useAuth } from '@/features/auth/AuthProvider';
import { loadProfile, updateProfile, type Profile } from '@/features/settings/profile-service';
import {
  getNotificationPermissionStatus,
  reconcileUpcomingTaskReminders,
  reminderWarning,
  requestNotificationPermission,
  setTaskRemindersEnabled,
  taskRemindersEnabled,
} from '@/features/tasks/task-notifications';
import { useAppTheme } from '@/hooks/useAppTheme';
import {
  billRemindersEnabled,
  billReminderWarning,
  reconcileUpcomingBillReminders,
  requestBillNotificationPermission,
  setBillRemindersEnabled,
} from '@/features/money/bill-notifications';

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
  const [remindersOn, setRemindersOn] = useState(true);
  const [permission, setPermission] = useState<
    'granted' | 'denied' | 'undetermined' | 'unavailable'
  >('undetermined');
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderMessage, setReminderMessage] = useState('');
  const [billRemindersOn, setBillRemindersOn] = useState(true);
  const [billReminderBusy, setBillReminderBusy] = useState(false);
  const [billReminderMessage, setBillReminderMessage] = useState('');

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

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = async () => {
      try {
        const [enabled, billEnabled, status] = await Promise.all([
          taskRemindersEnabled(userId),
          billRemindersEnabled(userId),
          getNotificationPermissionStatus(),
        ]);
        if (active) {
          setRemindersOn(enabled);
          setBillRemindersOn(billEnabled);
          setPermission(status);
        }
      } catch {
        if (active) setReminderMessage('Task reminder settings could not be loaded. Try again.');
      }
    };
    void load();
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') void load();
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [userId]);

  async function changeReminders(enabled: boolean) {
    if (!userId || reminderBusy) return;
    setReminderBusy(true);
    setReminderMessage('');
    try {
      const result = await setTaskRemindersEnabled(userId, enabled);
      setRemindersOn(enabled);
      if (result.status === 'error') {
        setReminderMessage('Task reminder settings could not be confirmed. Try again.');
        return;
      }
      if (enabled) await allowNotifications();
      else setReminderMessage('Task reminders are off. Pending reminders were canceled.');
    } catch {
      setReminderMessage('Task reminder settings could not be saved. Try again.');
    } finally {
      setReminderBusy(false);
    }
  }

  async function allowNotifications() {
    if (!userId) return;
    const status = await requestNotificationPermission();
    setPermission(status);
    if (status !== 'granted') {
      setReminderMessage(
        'Notifications are disabled on this device. Enable them in device settings to receive task reminders.',
      );
      return;
    }
    const result = await reconcileUpcomingTaskReminders(userId);
    setReminderMessage(reminderWarning(result) || 'Task reminders are enabled.');
    try {
      if (await billRemindersEnabled(userId)) {
        const bills = await reconcileUpcomingBillReminders(userId);
        setBillReminderMessage(billReminderWarning(bills));
      }
    } catch {
      setBillReminderMessage('Bill reminders could not be checked. Try again.');
    }
  }

  async function changeBillReminders(enabled: boolean) {
    if (!userId || billReminderBusy) return;
    setBillReminderBusy(true);
    setBillReminderMessage('');
    try {
      const result = await setBillRemindersEnabled(userId, enabled);
      if (result.status === 'error') {
        setBillReminderMessage('Bill reminder settings could not be confirmed. Try again.');
        return;
      }
      setBillRemindersOn(enabled);
      if (enabled) {
        const status = await requestBillNotificationPermission();
        setPermission(status);
        if (status === 'granted') {
          const scheduled = await reconcileUpcomingBillReminders(userId);
          setBillReminderMessage(billReminderWarning(scheduled) || 'Bill reminders are enabled.');
        } else
          setBillReminderMessage(
            'Notifications are disabled on this device. Bills still save normally.',
          );
      } else
        setBillReminderMessage('Bill reminders are off. Pending bill reminders were canceled.');
    } catch {
      setBillReminderMessage('Bill reminder settings could not be saved. Try again.');
    } finally {
      setBillReminderBusy(false);
    }
  }

  async function allowBillNotifications() {
    if (!userId) return;
    const status = await requestBillNotificationPermission();
    setPermission(status);
    if (status !== 'granted') {
      setBillReminderMessage(
        'Notifications are disabled on this device. Enable them in device settings.',
      );
      return;
    }
    const result = await reconcileUpcomingBillReminders(userId);
    setBillReminderMessage(billReminderWarning(result) || 'Bill reminders are enabled.');
  }

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
      try {
        if (await billRemindersEnabled(userId)) {
          const reminders = await reconcileUpcomingBillReminders(userId);
          setBillReminderMessage(billReminderWarning(reminders));
        }
      } catch {
        setBillReminderMessage('Bill reminders could not be checked after the timezone change.');
      }
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
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not sign out. Check your connection and try again.',
      );
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
            <View style={{ gap: theme.spacing.sm }}>
              <AppText variant="title">Task reminders</AppText>
              <AppText>Task reminders: {remindersOn ? 'On' : 'Off'}</AppText>
              <AppText tone="mutedText">
                When on, reminders are set for 1 hour, 30 minutes, and 5 minutes before a task
                deadline.
              </AppText>
              <AppText tone="mutedText">
                {permission === 'granted'
                  ? 'Device notifications allowed.'
                  : permission === 'unavailable'
                    ? 'Device notifications are unavailable.'
                    : 'Device notifications are disabled. Tasks still save normally.'}
              </AppText>
              <AppButton
                label={remindersOn ? 'Turn task reminders off' : 'Turn task reminders on'}
                variant="secondary"
                submitting={reminderBusy}
                onPress={() => void changeReminders(!remindersOn)}
              />
              {remindersOn && permission === 'undetermined' ? (
                <AppButton
                  label="Allow task notifications"
                  variant="secondary"
                  disabled={reminderBusy}
                  onPress={() => void allowNotifications()}
                />
              ) : null}
              {remindersOn && permission === 'denied' && Platform.OS !== 'web' ? (
                <AppButton
                  label="Open device notification settings"
                  variant="secondary"
                  onPress={() => void Linking.openSettings()}
                />
              ) : null}
              {reminderMessage ? (
                <AppText accessibilityRole="alert">{reminderMessage}</AppText>
              ) : null}
            </View>
            <View style={{ gap: theme.spacing.sm }}>
              <AppText variant="title">Bill reminders</AppText>
              <AppText>Bill reminders: {billRemindersOn ? 'On' : 'Off'}</AppText>
              <AppText tone="mutedText">
                When on, unpaid bills can remind you at 9:00 AM in your profile timezone, two days
                before, one day before, and on the due date.
              </AppText>
              <AppButton
                label={billRemindersOn ? 'Turn bill reminders off' : 'Turn bill reminders on'}
                variant="secondary"
                submitting={billReminderBusy}
                onPress={() => void changeBillReminders(!billRemindersOn)}
              />
              {billRemindersOn && permission === 'undetermined' ? (
                <AppButton
                  label="Allow bill notifications"
                  variant="secondary"
                  disabled={billReminderBusy}
                  onPress={() => void allowBillNotifications()}
                />
              ) : null}
              {billRemindersOn && permission === 'denied' && Platform.OS !== 'web' ? (
                <AppButton
                  label="Open device notification settings for bills"
                  variant="secondary"
                  onPress={() => void Linking.openSettings()}
                />
              ) : null}
              {billReminderMessage ? (
                <AppText accessibilityRole="alert">{billReminderMessage}</AppText>
              ) : null}
            </View>
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
