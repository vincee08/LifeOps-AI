import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { ErrorState, LoadingState } from '@/components/ui/StateView';
import { useAuth } from '@/features/auth/AuthProvider';
import { listTodayWorkouts, type WorkoutSession } from '@/features/workout/workout-service';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { TodayWindow } from './today-model';

type Section = 'planned' | 'completed';
type Page = { items: WorkoutSession[]; total: number; hasMore: boolean };
export function TodayWorkouts({ window }: { window: TodayWindow }) {
  const theme = useAppTheme();
  const router = useRouter();
  const { state } = useAuth();
  const ownerId = state.status === 'signed-in' ? state.session.user.id : null;
  const [pages, setPages] = useState<Record<Section, Page | null>>({
    planned: null,
    completed: null,
  });
  const [errors, setErrors] = useState<Record<Section, string>>({ planned: '', completed: '' });
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  useFocusEffect(
    useCallback(() => {
      void revision;
      if (!ownerId) return;
      let active = true;
      setLoading(true);
      setErrors({ planned: '', completed: '' });
      void Promise.allSettled([
        listTodayWorkouts(ownerId, window.date, 'planned'),
        listTodayWorkouts(ownerId, window.date, 'completed'),
      ]).then((results) => {
        if (!active) return;
        const nextPages: Record<Section, Page | null> = { planned: null, completed: null };
        const nextErrors = { planned: '', completed: '' };
        (['planned', 'completed'] as const).forEach((section, index) => {
          const result = results[index]!;
          if (result.status === 'fulfilled') nextPages[section] = result.value;
          else
            nextErrors[section] =
              result.reason instanceof Error
                ? result.reason.message
                : 'Workouts could not be loaded.';
        });
        setPages(nextPages);
        setErrors(nextErrors);
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [ownerId, window.date, revision]),
  );
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <AppText variant="title">Workouts</AppText>
      <AppText tone="mutedText">
        Plans and completed workouts for today. Plans do not send reminders.
      </AppText>
      {loading ? <LoadingState label="Loading today’s workouts…" /> : null}
      {(['planned', 'completed'] as const).map((section) => (
        <View key={section} style={{ gap: theme.spacing.sm }}>
          {errors[section] ? (
            <ErrorState
              title={`${section} workouts unavailable`}
              description={errors[section]}
              onRetry={refresh}
            />
          ) : null}
          {pages[section] ? (
            <>
              <AppText style={{ fontWeight: '700' }}>
                {section === 'planned' ? 'Planned for today' : 'Completed today'} (
                {pages[section]!.total})
              </AppText>
              {pages[section]!.items.map((workout) => (
                <Pressable
                  key={workout.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${workout.title} workout`}
                  onPress={() =>
                    router.navigate({
                      pathname: '/(tabs)/workout',
                      params: { workoutId: workout.id },
                    })
                  }
                  style={({ pressed }) => ({
                    minHeight: 48,
                    padding: theme.spacing.md,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <AppText>{workout.title}</AppText>
                </Pressable>
              ))}
              {pages[section]!.hasMore ? (
                <AppText tone="mutedText">Showing the first 20. Open Workout for more.</AppText>
              ) : null}
            </>
          ) : null}
        </View>
      ))}
      <AppButton
        label="View all workouts"
        variant="secondary"
        onPress={() => router.navigate('/(tabs)/workout')}
      />
    </View>
  );
}
