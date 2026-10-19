import { ActivityIndicator, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/hooks/useAppTheme';

type StateViewProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

function StateCard({ title, description, actionLabel, onAction }: StateViewProps) {
  const theme = useAppTheme();

  return (
    <View
      style={{
        gap: theme.spacing.md,
        padding: theme.spacing.xl,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <AppText variant="title">{title}</AppText>
      <AppText tone="mutedText">{description}</AppText>
      {actionLabel && onAction ? <AppButton label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const theme = useAppTheme();

  return (
    <View accessibilityRole="progressbar" style={{ alignItems: 'center', gap: theme.spacing.md }}>
      <ActivityIndicator color={theme.colors.primary} />
      <AppText tone="mutedText">{label}</AppText>
    </View>
  );
}

export function EmptyState({ title, description }: Pick<StateViewProps, 'title' | 'description'>) {
  return <StateCard title={title} description={description} />;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <StateCard title={title} description={description} actionLabel="Try again" onAction={onRetry} />
  );
}
