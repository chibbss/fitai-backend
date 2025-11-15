import React, {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { ColorSchemeName, useColorScheme } from 'react-native';
import { themes } from '@/constants/theme';

type ThemeMode = keyof typeof themes;
type ThemePreference = ThemeMode | 'system';

type ThemeContextValue = {
  mode: ThemeMode;
  colors: typeof themes.dark.colors;
  systemColorScheme: ColorSchemeName;
  isDarkMode: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const systemColorScheme = useColorScheme() ?? 'dark';
  const [preference, setPreference] = useState<ThemePreference>('dark');

  const resolvedMode: ThemeMode =
    preference === 'system'
      ? systemColorScheme === 'light'
        ? 'light'
        : 'dark'
      : preference;

  const setThemePreference = useCallback(
    (nextPreference: ThemePreference) => {
      setPreference(nextPreference);
    },
    []
  );

  const value = useMemo<ThemeContextValue>(() => {
    const theme = themes[resolvedMode];

    return {
      mode: resolvedMode,
      colors: theme.colors,
      systemColorScheme,
      isDarkMode: resolvedMode === 'dark',
      preference,
      setPreference: setThemePreference,
    };
  }, [resolvedMode, preference, setThemePreference, systemColorScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};
