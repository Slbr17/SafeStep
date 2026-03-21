import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from 'react-native';

<<<<<<< HEAD
=======
import AppTabs from '@/components/app-tabs';
>>>>>>> a74c0b5d9cdc6da358fa73bcb44874fafea5f001
import { AuthProvider } from '@/context/auth-context';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
<<<<<<< HEAD
        <Stack screenOptions={{ headerShown: false }} />
=======
        <AppTabs />
>>>>>>> a74c0b5d9cdc6da358fa73bcb44874fafea5f001
      </ThemeProvider>
    </AuthProvider>
  );
}
