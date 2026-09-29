import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { SettingsProvider, useSettings } from '@/state/settings';

SplashScreen.preventAutoHideAsync();

function HideSplashWhenReady() {
  const { ready } = useSettings();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: theme.background, card: theme.background, text: theme.text, border: theme.border, primary: theme.accent },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <SettingsProvider>
        <HideSplashWhenReady />
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
            headerTitleStyle: { fontWeight: '600', fontSize: 17 },
            contentStyle: { backgroundColor: theme.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="session" options={{ title: 'Listening' }} />
          <Stack.Screen name="add" options={{ title: 'Add cards' }} />
          <Stack.Screen name="import" options={{ title: 'Import cards' }} />
          <Stack.Screen name="decks" options={{ title: 'Decks' }} />
          <Stack.Screen name="edit/[id]" options={{ title: 'Edit card' }} />
        </Stack>
      </SettingsProvider>
    </ThemeProvider>
  );
}
