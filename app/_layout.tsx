import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, LogBox, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

// Suppress the in-app yellow "Open debugger to view warnings" toast. Warnings
// still print to the Metro terminal — we just don't want them blocking UI.
LogBox.ignoreAllLogs();
import type { Session } from '@supabase/supabase-js';
import { COLORS, CURRENT_YEAR } from '../src/constants';
import { useAppStore } from '../src/store/useAppStore';
import { useCurrentRound } from '../src/hooks/useCurrentRound';
import { AnimatedSplash } from '../src/components/AnimatedSplash';
import { AuthScreen } from '../src/components/AuthScreen';
import { supabase, isSupabaseConfigured } from '../src/api/supabase';

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

// Tracks the Supabase auth session. While `loading` is true we show a spinner
// instead of bouncing the user briefly through AuthScreen on cold start.
function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export default function RootLayout() {
  // Show the animated splash on cold start. Once its sequence runs through,
  // it calls onFinish and the overlay unmounts to reveal the real app.
  const [splashDone, setSplashDone] = useState(false);
  const { session, loading: authLoading } = useSession();

  // When Supabase keys aren't filled in yet, skip the auth gate entirely so
  // the app still works locally. Sign-in becomes available the moment real
  // keys land in app.json's expo.extra block.
  if (isSupabaseConfigured && authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (isSupabaseConfigured && !session) {
    return (
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <AuthScreen />
      </QueryClientProvider>
    );
  }

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
