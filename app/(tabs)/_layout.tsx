import { Tabs } from 'expo-router';
import { COLORS } from '../../src/constants';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.textPrimary,
        headerTitleStyle: { fontWeight: '700' },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Players', tabBarLabel: 'Players' }}
      />
      <Tabs.Screen
        name="captains"
        options={{ title: 'Captains', tabBarLabel: 'Captains' }}
      />
      <Tabs.Screen
        name="trades"
        options={{ title: 'Trades', tabBarLabel: 'Trades' }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: 'Stat DNA', tabBarLabel: 'Stat DNA' }}
      />
      <Tabs.Screen
        name="myteam"
        options={{ title: 'My Team', tabBarLabel: 'My Team' }}
      />
    </Tabs>
  );
}
