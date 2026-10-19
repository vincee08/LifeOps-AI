import { useRouter } from 'expo-router';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen>
      <AppText variant="display" accessibilityRole="header">
        Page not found
      </AppText>
      <AppText tone="mutedText">That destination is not available.</AppText>
      <AppButton label="Go to Today" onPress={() => router.replace('/')} />
    </Screen>
  );
}
