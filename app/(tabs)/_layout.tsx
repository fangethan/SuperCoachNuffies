import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { COLORS } from '../../src/constants';

const TRIANGLE_SIZE = 8;

function TabArrow({ focused }: { focused: boolean }) {
  const color = focused ? COLORS.success : COLORS.textMuted;
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: TRIANGLE_SIZE,
        borderRightWidth: TRIANGLE_SIZE,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        ...(focused
          ? { borderBottomWidth: TRIANGLE_SIZE, borderBottomColor: color }
          : { borderTopWidth: TRIANGLE_SIZE, borderTopColor: color }),
      }}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: COLORS.success,
        tabBarInactiveTintColor: COLORS.textMuted,
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.textPrimary,
        headerTitleStyle: { fontWeight: '700' },
        tabBarLabelStyle: { fontSize: 11 },
        tabBarIcon: ({ focused }) => <TabArrow focused={focused} />,
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
