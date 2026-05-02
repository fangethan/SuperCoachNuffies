import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { COLORS, CURRENT_YEAR } from '../src/constants';
import { useAppStore } from '../src/store/useAppStore';
import { useCurrentRound } from '../src/hooks/useCurrentRound';
import { AnimatedSplash } from '../src/components/AnimatedSplash';

const queryClient = new QueryClient();

// Detects the current round globally and syncs it to the store.
// maxRound is always updated (so the round picker knows the upper bound).
// currentRound is only set once on first detection — user picks via the
// round picker are not overridden on subsequent 15-min refetches.
function StorageHydrator() {
  const hydrateFromStorage = useAppStore(s => s.hydrateFromStorage);
  useEffect(() => { hydrateFromStorage(); }, []);
  return null;
}

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
  // Show the animated splash on cold start. Once its sequence runs through,
  // it calls onFinish and the overlay unmounts to reveal the real app.
  const [splashDone, setSplashDone] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <StorageHydrator />
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
      {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
    </QueryClientProvider>
  );
}
