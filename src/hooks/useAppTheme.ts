import { useColorScheme } from 'react-native';

import { themes } from '@/lib/theme/tokens';

export function useAppTheme() {
  return themes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
