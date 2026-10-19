import { Text, type TextProps } from 'react-native';

import { useAppTheme } from '@/hooks/useAppTheme';
import type { AppTheme } from '@/lib/theme/tokens';

type TextVariant = keyof AppTheme['typography'];
type TextTone = 'text' | 'mutedText' | 'primary' | 'danger';

type AppTextProps = TextProps & {
  variant?: TextVariant;
  tone?: TextTone;
};

export function AppText({ variant = 'body', tone = 'text', style, ...props }: AppTextProps) {
  const theme = useAppTheme();

  return (
    <Text
      allowFontScaling
      style={[theme.typography[variant], { color: theme.colors[tone] }, style]}
      {...props}
    />
  );
}
