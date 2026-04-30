import { Tabs } from 'expo-router';
import { COLORS } from '../../src/constants';
import { RoundPicker } from '../../src/components/RoundPicker';

const roundPickerRight = () => <RoundPicker />;

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
        options={{ title: 'Players', tabBarLabel: 'Players', headerRight: roundPickerRight }}
      />
      <Tabs.Screen
        name="captains"
        options={{ title: 'Captains', tabBarLabel: 'Captains', headerRight: roundPickerRight }}
      />
      <Tabs.Screen
        name="trades"
        options={{ title: 'Trades', tabBarLabel: 'Trades', headerRight: roundPickerRight }}
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
