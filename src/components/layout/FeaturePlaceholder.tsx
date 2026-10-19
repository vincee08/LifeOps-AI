import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/StateView';
import { Screen } from '@/components/ui/Screen';
import { useAppTheme } from '@/hooks/useAppTheme';

type FeaturePlaceholderProps = {
  title: string;
  description: string;
};

export function FeaturePlaceholder({ title, description }: FeaturePlaceholderProps) {
  const theme = useAppTheme();

  return (
    <Screen>
      <View style={{ gap: theme.spacing.sm }}>
        <AppText variant="eyebrow" tone="primary" style={{ textTransform: 'uppercase' }}>
          LifeOps AI
        </AppText>
        <AppText variant="display" accessibilityRole="header">
          {title}
        </AppText>
        <AppText tone="mutedText">{description}</AppText>
      </View>
      <EmptyState
        title="Ready for what comes next"
        description="This space is prepared for the next development milestone. No sample records are shown."
      />
    </Screen>
  );
}
