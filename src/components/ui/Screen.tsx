import type { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';

import { useAppTheme } from '@/hooks/useAppTheme';

export function Screen({ children }: PropsWithChildren) {
  const theme = useAppTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}
