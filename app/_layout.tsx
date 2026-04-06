import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { COLORS, CURRENT_YEAR } from '../src/constants';
import { useAppStore } from '../src/store/useAppStore';
import { useCurrentRound } from '../src/hooks/useCurrentRound';

const queryClient = new QueryClient();

// Detects the current round globally and syncs it to the store
// so every tab reacts to round changes automatically
function RoundSync() {
  const { data: detectedRound } = useCurrentRound(CURRENT_YEAR);
  const setCurrentRound = useAppStore(s => s.setCurrentRound);

  useEffect(() => {
    if (detectedRound) setCurrentRound(detectedRound);
  }, [detectedRound]);

  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <RoundSync />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.textPrimary,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="player/[id]"
          options={{ title: 'Player', headerBackTitle: 'Back' }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
