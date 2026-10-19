import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { SettingsButton } from '@/components/navigation/SettingsButton';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function TabLayout() {
  const theme = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        headerShadowVisible: false,
        headerRight: () => <SettingsButton />,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedText,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarItemStyle: { minHeight: 48 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarAccessibilityLabel: 'Today tab',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'today' : 'today-outline'}
              color={typeof color === 'string' ? color : theme.colors.mutedText}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarAccessibilityLabel: 'Tasks tab',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'checkbox' : 'checkbox-outline'}
              color={typeof color === 'string' ? color : theme.colors.mutedText}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="money"
        options={{
          title: 'Money',
          tabBarAccessibilityLabel: 'Money tab',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'wallet' : 'wallet-outline'}
              color={typeof color === 'string' ? color : theme.colors.mutedText}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="workout"
        options={{
          title: 'Workout',
          tabBarAccessibilityLabel: 'Workout tab',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'barbell' : 'barbell-outline'}
              color={typeof color === 'string' ? color : theme.colors.mutedText}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: 'AI',
          tabBarAccessibilityLabel: 'AI tab',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'sparkles' : 'sparkles-outline'}
              color={typeof color === 'string' ? color : theme.colors.mutedText}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
