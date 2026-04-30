import React from 'react';
import { View, StyleSheet } from 'react-native';
import { TEAM_COLORS } from '../constants';

interface Props {
  teamName: string;
  abbrev?: string;
  size?: number;
}

export function TeamBadge({ teamName, size = 32 }: Props) {
  const colors = TEAM_COLORS[teamName] ?? { primary: '#334155', secondary: '#475569' };

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }]}>
      <View style={[styles.half, { backgroundColor: colors.primary }]} />
      <View style={[styles.half, { backgroundColor: colors.secondary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    flexDirection: 'row',
  },
  half: {
    flex: 1,
  },
});
