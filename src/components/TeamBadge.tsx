import React from 'react';
import { View, StyleSheet } from 'react-native';
import { TEAM_COLORS } from '../constants';

interface Props {
  teamName: string;
  abbrev?: string;
  size?: number;
}

export function TeamBadge({ teamName, size = 32 }: Props) {
  const config = TEAM_COLORS[teamName];
  const colors = config?.colors ?? ['#334155', '#475569'];
  const isHorizontal = config?.direction === 'h';

  if (colors.length === 1) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[0] }} />
    );
  }

  return (
    <View style={[
      { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' },
      isHorizontal ? styles.column : styles.row,
    ]}>
      {colors.map((color, i) => (
        <View key={i} style={[styles.section, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  column: { flexDirection: 'column' },
  section: { flex: 1 },
});
