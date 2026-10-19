import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/hooks/useAppTheme';

type AppButtonProps = Omit<
  PressableProps,
  'children' | 'style' | 'accessibilityRole' | 'accessibilityState'
> & {
  label: string;
  variant?: 'primary' | 'secondary';
  submitting?: boolean;
};

export function AppButton({
  label,
  variant = 'primary',
  submitting = false,
  disabled = false,
  accessibilityLabel,
  ...props
}: AppButtonProps) {
  const theme = useAppTheme();
  const inactive = disabled || submitting;
  const primary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: submitting }}
      disabled={inactive}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: primary ? theme.colors.primary : theme.colors.border,
        backgroundColor: primary ? theme.colors.primary : theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: theme.spacing.sm,
        opacity: inactive ? 0.5 : pressed ? 0.78 : 1,
      })}
      {...props}
    >
      {submitting ? (
        <ActivityIndicator color={primary ? theme.colors.onPrimary : theme.colors.primary} />
      ) : null}
      <AppText
        style={{ color: primary ? theme.colors.onPrimary : theme.colors.text, fontWeight: '700' }}
      >
        {submitting ? `${label}…` : label}
      </AppText>
    </Pressable>
  );
}
