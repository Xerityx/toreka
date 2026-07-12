import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const dark = colorScheme !== 'light';
  const palette = dark ? Colors.dark : Colors.light;

  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme : DefaultTheme).colors,
      background: palette.background,
      card: palette.background,
      text: palette.text,
      primary: palette.accent,
      border: 'transparent',
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={navTheme}>
          <AnimatedSplashOverlay />
          <Stack
            screenOptions={{
              headerBackButtonDisplayMode: 'minimal',
              headerTintColor: palette.accent,
              headerTitleStyle: { color: palette.text },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="card/[id]" options={{ title: '' }} />
            <Stack.Screen name="set/[id]" options={{ title: '' }} />
            <Stack.Screen name="edit-copy" options={{ presentation: 'modal', title: 'Edit' }} />
            <Stack.Screen name="edit-sealed" options={{ presentation: 'modal', title: 'Sealed' }} />
            <Stack.Screen name="grade" options={{ presentation: 'modal', title: 'Grade a Card' }} />
            <Stack.Screen name="grade-report/[id]" options={{ title: 'Grade Report' }} />
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
