export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  eyebrow: { fontSize: 12, lineHeight: 18, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  title: { fontSize: 22, lineHeight: 29, fontWeight: '700' as const },
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const },
} as const;

const lightColors = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  text: '#15253A',
  mutedText: '#4A5B70',
  border: '#D6DEE8',
  primary: '#165D75',
  onPrimary: '#FFFFFF',
  softPrimary: '#E4F2F5',
  danger: '#A53137',
  onDanger: '#FFFFFF',
} as const;

const darkColors: Record<keyof typeof lightColors, string> = {
  background: '#0F1722',
  surface: '#182432',
  text: '#F3F7FA',
  mutedText: '#B7C5D2',
  border: '#344559',
  primary: '#75C7DC',
  onPrimary: '#10202A',
  softPrimary: '#183A48',
  danger: '#F4A1A5',
  onDanger: '#291214',
};

export type AppTheme = {
  mode: 'light' | 'dark';
  colors: Record<keyof typeof lightColors, string>;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
};

export const themes: Record<'light' | 'dark', AppTheme> = {
  light: { mode: 'light', colors: lightColors, spacing, radius, typography },
  dark: { mode: 'dark', colors: darkColors, spacing, radius, typography },
};
