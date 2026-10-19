import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { useAppTheme } from '@/hooks/useAppTheme';

export function SettingsButton() {
  const router = useRouter();
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open settings"
      onPress={() => router.push('/settings')}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.pill,
        backgroundColor: pressed ? theme.colors.softPrimary : 'transparent',
      })}
    >
      <Ionicons name="person-circle-outline" size={28} color={theme.colors.primary} />
    </Pressable>
  );
}
