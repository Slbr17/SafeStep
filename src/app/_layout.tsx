import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import React from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { AuthProvider } from '@/context/auth-context';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppTabs />
      </ThemeProvider>
    </AuthProvider>
  );
}
