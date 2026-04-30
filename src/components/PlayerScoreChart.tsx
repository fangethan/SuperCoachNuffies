import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Dimensions, Pressable,
  type GestureResponderEvent,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { COLORS } from '../constants';

interface Props {
  perRoundScores: Record<number, number>;
  perRoundBE?:    Record<number, number>; // computed from price history; falls back to window formula
  avg:   number;
  ppts:  number;
}

const BE_COLOR  = '#c084fc'; // purple
const AVG_COLOR = COLORS.textSecondary; // #94a3b8

// Keep in sync with BarChart props below
const CHART_H    = 160;
const Y_AXIS_W   = 35;
const INIT_SPACE = 4;
const INTRA      = 1;
const INTER      = 4;

type Series = 'score' | 'avg' | 'be';

export function PlayerScoreChart({ perRoundScores, perRoundBE, avg, ppts }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<Series>>(new Set());

  const toggleSeries = (s: Series) =>
    setHidden(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const playedRounds = useMemo(() =>
    Object.keys(perRoundScores)
      .map(Number)
      .filter(r => r > 0 && perRoundScores[r] > 0)
      .sort((a, b) => a - b),
    [perRoundScores],
  );
  const n = playedRounds.length;

  const screenWidth = Dimensions.get('window').width;
  const chartWidth  = screenWidth - 32 - 28;

  const available   = chartWidth - Y_AXIS_W - INIT_SPACE;
  const barW        = Math.max(3, Math.min(8,
    Math.floor((available - (INTRA + INTER) * n) / (n * 2)),
  ));
  const groupStride = 2 * barW + INTRA + INTER;

  const runningAvgs = useMemo(() => {
    let sum = 0;
    return playedRounds.map((r, i) => { sum += perRoundScores[r]; return Math.round(sum / (i + 1)); });
  }, [playedRounds, perRoundScores]);

  // Per-round BE: use fetched price-based data if available, else partial-window fallback.
  // Partial window: missing pre-season slots treated as 0 (same as SC does early in season).
  const bePerRound = useMemo(() =>
    playedRounds.map((r, idx) => {
      if (perRoundBE?.[r] !== undefined) return perRoundBE[r];
      if (idx >= 3) return perRoundScores[playedRounds[idx - 3]];
      const priorSum = playedRounds.slice(0, idx).reduce((s, pr) => s + perRoundScores[pr], 0);
      return Math.round(priorSum / 3);
    }),
    [playedRounds, perRoundScores, perRoundBE],
  );

  if (n === 0) return null;

  const maxScore = Math.max(...playedRounds.map(r => perRoundScores[r]));
  const maxBE    = Math.max(0, ...bePerRound);
  const maxY     = Math.ceil(Math.max(maxScore, avg * 1.1, maxBE) / 20) * 20;

  const scoreHidden = hidden.has('score');
  const avgHidden   = hidden.has('avg');
  const beHidden    = hidden.has('be');

  const chartData = useMemo(() => {
    const data: any[] = [];
    playedRounds.forEach((r, idx) => {
      const dimmed = selectedIdx !== null && selectedIdx !== idx;
      const isLast = idx === n - 1;
      data.push({
        value:      perRoundScores[r],
        frontColor: scoreHidden ? `${COLORS.success}18` : dimmed ? `${COLORS.success}55` : COLORS.success,
        label:      String(r),
        spacing:    INTRA,
        barWidth:   barW,
      });
      data.push({
        value:      runningAvgs[idx],
        frontColor: avgHidden ? `${AVG_COLOR}18` : dimmed ? `${AVG_COLOR}55` : AVG_COLOR,
        label:      '',
        spacing:    isLast ? 0 : INTER,
        barWidth:   barW,
      });
    });
    return data;
  }, [playedRounds, perRoundScores, runningAvgs, barW, n, selectedIdx, scoreHidden, avgHidden]);

  // BE SVG dot-line
  const dotPoints = playedRounds.map((_, idx) => ({
    x: Y_AXIS_W + INIT_SPACE + idx * groupStride + barW + INTRA / 2,
    y: Math.max(0, Math.min(CHART_H, CHART_H * (1 - bePerRound[idx] / maxY))),
  }));
  const polyPts = dotPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Tap handler: convert locationX to group index
  const handlePress = (e: GestureResponderEvent) => {
    const relX = e.nativeEvent.locationX - Y_AXIS_W - INIT_SPACE;
    if (relX < 0) { setSelectedIdx(null); return; }
    const idx = Math.floor(relX / groupStride);
    if (idx < 0 || idx >= n) { setSelectedIdx(null); return; }
    setSelectedIdx(prev => prev === idx ? null : idx);
  };

  // Tooltip
  const TOOLTIP_W = 160;
  const tip = selectedIdx !== null ? {
    round:  playedRounds[selectedIdx],
    score:  perRoundScores[playedRounds[selectedIdx]],
    runAvg: runningAvgs[selectedIdx],
    be:     bePerRound[selectedIdx],
    left:   Math.max(4, Math.min(
      chartWidth - TOOLTIP_W - 4,
      Y_AXIS_W + INIT_SPACE + selectedIdx * groupStride + barW - TOOLTIP_W / 2,
    )),
  } : null;

  return (
    <View style={styles.wrapper}>
      {/* Legend — tap to toggle series */}
      <View style={styles.legend}>
        <Pressable style={styles.legendItem} onPress={() => toggleSeries('score')}>
          <View style={[styles.dot, { backgroundColor: scoreHidden ? `${COLORS.success}40` : COLORS.success }]} />
          <Text style={[styles.legendText, scoreHidden && styles.legendTextHidden]}>Round Score</Text>
        </Pressable>
        <Pressable style={styles.legendItem} onPress={() => toggleSeries('avg')}>
          <View style={[styles.dot, { backgroundColor: avgHidden ? `${AVG_COLOR}40` : AVG_COLOR }]} />
          <Text style={[styles.legendText, avgHidden && styles.legendTextHidden]}>Avg. Score</Text>
        </Pressable>
        {ppts > 0 && (
          <Pressable style={styles.legendItem} onPress={() => toggleSeries('be')}>
            <View style={[styles.dot, {
              backgroundColor: beHidden ? `${BE_COLOR}40` : BE_COLOR,
              width: 6, height: 6, borderRadius: 3,
            }]} />
            <Text style={[styles.legendText, beHidden && styles.legendTextHidden]}>BE</Text>
          </Pressable>
        )}
      </View>

      {/* Chart */}
      <View>
        <BarChart
          data={chartData}
          width={chartWidth}
          height={CHART_H}
          spacing={INTER}
          yAxisLabelWidth={Y_AXIS_W}
          roundedTop
          hideRules
          maxValue={maxY}
          noOfSections={4}
          xAxisColor={COLORS.border}
          yAxisColor="transparent"
          yAxisTextStyle={styles.axisText}
          xAxisLabelTextStyle={styles.axisText}
          backgroundColor="transparent"
          isAnimated
          animationDuration={300}
          disableScroll
        />

        {/* Transparent tap overlay spanning the full bar area */}
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: CHART_H }}
          onPress={handlePress}
        />

        {/* BE dot-line (pointer-events off so Pressable beneath still fires) */}
        {ppts > 0 && !beHidden && (
          <Svg
            style={StyleSheet.absoluteFill}
            width={chartWidth}
            height={CHART_H}
            pointerEvents="none"
          >
            {n > 1 && (
              <Polyline
                points={polyPts}
                fill="none"
                stroke={BE_COLOR}
                strokeWidth={1.5}
                strokeDasharray={[4, 2]}
                opacity={0.85}
              />
            )}
            {dotPoints.map((p, i) => (
              <Circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={selectedIdx === i ? 5 : 3}
                fill={BE_COLOR}
                opacity={selectedIdx !== null && selectedIdx !== i ? 0.3 : 1}
              />
            ))}
          </Svg>
        )}

        {/* Tap tooltip */}
        {tip && (
          <View style={[styles.tooltip, { left: tip.left }]} pointerEvents="none">
            <Text style={styles.tipHeader}>Round {tip.round}</Text>
            {!scoreHidden && (
              <View style={styles.tipRow}>
                <View style={[styles.tipDot, { backgroundColor: COLORS.success }]} />
                <Text style={styles.tipLabel}>Round Score: </Text>
                <Text style={styles.tipVal}>{tip.score}</Text>
              </View>
            )}
            {!avgHidden && (
              <View style={styles.tipRow}>
                <View style={[styles.tipDot, { backgroundColor: AVG_COLOR }]} />
                <Text style={styles.tipLabel}>Avg. Score: </Text>
                <Text style={styles.tipVal}>{tip.runAvg}</Text>
              </View>
            )}
            {ppts > 0 && !beHidden && (
              <View style={styles.tipRow}>
                <View style={[styles.tipDot, { backgroundColor: BE_COLOR }]} />
                <Text style={styles.tipLabel}>BE: </Text>
                <Text style={styles.tipVal}>{tip.be}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: 4 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: COLORS.textMuted },
  legendTextHidden: { opacity: 0.35 },
  axisText: { color: COLORS.textMuted, fontSize: 9 },
  tooltip: {
    position: 'absolute',
    top: 4,
    width: 160,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
  },
  tipHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tipDot: { width: 7, height: 7, borderRadius: 3.5 },
  tipLabel: { fontSize: 11, color: COLORS.textSecondary },
  tipVal: { fontSize: 11, fontWeight: '700', color: COLORS.textPrimary },
});
