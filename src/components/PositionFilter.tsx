import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { PositionFilter as PF } from '../types';
import { COLORS, POSITIONS } from '../constants';
import { useAppStore } from '../store/useAppStore';

const OPTIONS: PF[] = ['ALL', 'DEF', 'MID', 'FWD', 'RUC'];

export function PositionFilterBar() {
  const { positionFilter, setPositionFilter } = useAppStore();

  return (
    <View style={styles.container}>
      {OPTIONS.map(pos => {
        const active = positionFilter === pos;
        const color = pos === 'ALL' ? COLORS.primary : POSITIONS[pos as keyof typeof POSITIONS]?.color;
        return (
          <TouchableOpacity
            key={pos}
            activeOpacity={0.8}
            style={[
              styles.pill,
              active
                ? { backgroundColor: color + '22', borderColor: color }
                : { backgroundColor: 'transparent', borderColor: COLORS.border },
            ]}
            onPress={() => setPositionFilter(pos)}
          >
            <Text style={[styles.label, active ? { color } : { color: COLORS.textMuted }]}>
              {pos}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: 10,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
