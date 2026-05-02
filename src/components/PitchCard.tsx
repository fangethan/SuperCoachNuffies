import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TeamBadge } from './TeamBadge';
import { Player } from '../types';
import { COLORS } from '../constants';

interface Props {
  player: Player;
  isCaptain?: boolean;
  isVC?: boolean;
  lastScore?: number | null;
  onPress: () => void;
}

export function PitchCard({ player, isCaptain, isVC, lastScore, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.badgeWrap}>
        <TeamBadge teamName={player.team?.name ?? ''} size={38} />
        {isCaptain && (
          <View style={[styles.badge, { backgroundColor: '#FFD200' }]}>
            <Text style={[styles.badgeText, { color: '#000' }]}>C</Text>
          </View>
        )}
        {isVC && !isCaptain && (
          <View style={[styles.badge, { backgroundColor: '#C084FC' }]}>
            <Text style={[styles.badgeText, { color: '#fff' }]}>V</Text>
          </View>
        )}
      </View>
      <View style={styles.chip}>
        <Text style={styles.name} numberOfLines={1}>{player.last_name}</Text>
        <Text style={styles.score}>
          {typeof lastScore === 'number' && lastScore > 0 ? String(lastScore) : '–'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', width: 72 },
  badgeWrap: { position: 'relative' },
  badge: {
    position: 'absolute', top: -4, right: -4,
    width: 16, height: 16, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.background,
  },
  badgeText: { fontSize: 8, fontWeight: '800' },
  chip: {
    marginTop: 5,
    backgroundColor: 'rgba(10,14,26,0.82)',
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 3,
    alignItems: 'center', width: 70,
  },
  name: { fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'center' },
  score: { fontSize: 11, fontWeight: '800', color: COLORS.primary, marginTop: 1 },
});
