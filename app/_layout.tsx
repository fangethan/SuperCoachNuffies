import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { COLORS, CURRENT_YEAR } from '../src/constants';
import { useAppStore } from '../src/store/useAppStore';
import { useCurrentRound } from '../src/hooks/useCurrentRound';

const queryClient = new QueryClient();

// Detects the current round globally and syncs it to the store.
// maxRound is always updated (so the round picker knows the upper bound).
// currentRound is only set once on first detection — user picks via the
// round picker are not overridden on subsequent 15-min refetches.
function RoundSync() {
  const { data: detectedRound } = useCurrentRound(CURRENT_YEAR);
  const { setCurrentRound, setMaxRound } = useAppStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (detectedRound) {
      setMaxRound(detectedRound);
      if (!initialized.current) {
        setCurrentRound(detectedRound);
        initialized.current = true;
      }
    }
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
