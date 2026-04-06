import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { usePlayers } from '../../src/hooks/usePlayers';
import { computeStatCorrelations } from '../../src/utils/correlation';
import { COLORS, POSITIONS, CURRENT_YEAR } from '../../src/constants';
import { PositionFilter } from '../../src/types';
import { useAppStore } from '../../src/store/useAppStore';

const POS_OPTIONS: PositionFilter[] = ['ALL', 'DEF', 'MID', 'FWD', 'RUC'];

export default function StatDnaScreen() {
  const [position, setPosition] = useState<PositionFilter>('ALL');
  const currentRound = useAppStore(s => s.currentRound);
  const { data: players, isLoading } = usePlayers(CURRENT_YEAR, currentRound);

  const correlations = useMemo(() => {
    if (!players) return [];
    return computeStatCorrelations(players, position).slice(0, 15);
  }, [players, position]);

  if (isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  const maxCorr = correlations[0]?.correlation ?? 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Scoring DNA</Text>
      <Text style={styles.subtitle}>
        Which stats drive SuperCoach scores the most? Based on Round {currentRound} data.
        Accuracy improves as the season progresses. Updates each round automatically.
      </Text>

      {/* Position selector */}
      <View style={styles.posRow}>
        {POS_OPTIONS.map(pos => {
          const active = position === pos;
          const color = pos === 'ALL' ? COLORS.primary : POSITIONS[pos as keyof typeof POSITIONS]?.color;
          return (
            <TouchableOpacity
              key={pos}
              style={[styles.posPill, active && { backgroundColor: color + '22', borderColor: color }]}
              onPress={() => setPosition(pos)}
            >
              <Text style={[styles.posLabel, active && { color }]}>{pos}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Correlation bars */}
      <View style={styles.barList}>
        {correlations.map((item, i) => {
          const pct = Math.abs(item.correlation) / Math.abs(maxCorr);
          const isPositive = item.correlation >= 0;
          const barColor = isPositive ? COLORS.success : COLORS.danger;
          const impact = pct > 0.7 ? 'Very High' : pct > 0.5 ? 'High' : pct > 0.3 ? 'Medium' : 'Low';

          return (
            <View key={item.stat} style={styles.barRow}>
              <View style={styles.barMeta}>
                <Text style={styles.barLabel} numberOfLines={1}>{item.label}</Text>
                <Text style={[styles.impactTag, { color: barColor }]}>{impact}</Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${pct * 100}%` as any, backgroundColor: barColor },
                  ]}
                />
              </View>
              <Text style={styles.corrValue}>{item.correlation.toFixed(2)}</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.footnote}>
        Correlation coefficient: 1.0 = perfectly predicts SC score, 0.0 = no relationship, negative = hurts score.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 20 },
  posRow: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  posPill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  posLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  barList: { gap: 14 },
  barRow: { gap: 6 },
  barMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barLabel: { fontSize: 13, color: COLORS.textPrimary, fontWeight: '500', flex: 1 },
  impactTag: { fontSize: 11, fontWeight: '700', marginLeft: 8 },
  barTrack: {
    height: 8, backgroundColor: COLORS.border,
    borderRadius: 4, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  corrValue: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right' },
  footnote: { fontSize: 11, color: COLORS.textMuted, marginTop: 24, lineHeight: 18 },
});
