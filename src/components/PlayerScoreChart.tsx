import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { COLORS } from '../constants';

interface Props {
  perRoundScores: Record<number, number>;
  perRoundBE?:    Record<number, number>;
  avg:   number;
  ppts:  number;
}

const BE_COLOR  = '#c084fc';
const AVG_COLOR = COLORS.textSecondary;

const CHART_H    = 160;
const Y_AXIS_W   = 35;
const INIT_SPACE = 4;
const INTRA      = 1;
const INTER      = 4;

type Series   = 'score' | 'avg' | 'be';
type Selected = { idx: number; type: Series } | null;

export function PlayerScoreChart({ perRoundScores, perRoundBE, avg, ppts }: Props) {
  const [selected, setSelected] = useState<Selected>(null);
  const [hidden,   setHidden]   = useState<Set<Series>>(new Set());

  const toggleSeries = (s: Series) =>
    setHidden(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const selectItem = (idx: number, type: Series) =>
    setSelected(prev => prev?.idx === idx && prev?.type === type ? null : { idx, type });

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

  const bePerRound = useMemo(() =>
    playedRounds.map((r, idx) => {
      if (perRoundBE?.[r] !== undefined) return perRoundBE[r];
      if (idx >= 3) return perRoundScores[playedRounds[idx - 3]];
      return Math.round(
        playedRounds.slice(0, idx).reduce((s, pr) => s + perRoundScores[pr], 0) / 3,
      );
    }),
    [playedRounds, perRoundScores, perRoundBE],
  );

  if (n === 0) return null;

  const scoreHidden = hidden.has('score');
  const avgHidden   = hidden.has('avg');
  const beHidden    = hidden.has('be');

  const maxScore = Math.max(...playedRounds.map(r => perRoundScores[r]));
  const maxBE    = Math.max(0, ...bePerRound);
  const maxY     = Math.ceil(Math.max(maxScore, avg * 1.1, maxBE) / 20) * 20;

  const chartData = useMemo(() => {
    const data: any[] = [];
    playedRounds.forEach((r, idx) => {
      const isLast      = idx === n - 1;
      const scoreActive = selected?.idx === idx && selected?.type === 'score';
      const avgActive   = selected?.idx === idx && selected?.type === 'avg';
      const anySelected = selected !== null;

      data.push({
        value:      perRoundScores[r],
        frontColor: scoreHidden
          ? `${COLORS.success}18`
          : anySelected && !scoreActive ? `${COLORS.success}28` : COLORS.success,
        label:      String(r),
        spacing:    INTRA,
        barWidth:   barW,
      });
      data.push({
        value:      runningAvgs[idx],
        frontColor: avgHidden
          ? `${AVG_COLOR}18`
          : anySelected && !avgActive ? `${AVG_COLOR}28` : AVG_COLOR,
        label:      '',
        spacing:    isLast ? 0 : INTER,
        barWidth:   barW,
      });
    });
    return data;
  }, [playedRounds, perRoundScores, runningAvgs, barW, n, selected, scoreHidden, avgHidden]);

  const dotPoints = playedRounds.map((_, idx) => ({
    x: Y_AXIS_W + INIT_SPACE + idx * groupStride + barW + INTRA / 2,
    y: Math.max(0, Math.min(CHART_H, CHART_H * (1 - bePerRound[idx] / maxY))),
  }));
  const polyPts = dotPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Tooltip — only shows the tapped element's value
  const TOOLTIP_W = 168;
  const tip = selected !== null ? (() => {
    const r      = playedRounds[selected.idx];
    const tipX   = selected.type === 'score'
      ? Y_AXIS_W + INIT_SPACE + selected.idx * groupStride + barW / 2
      : selected.type === 'avg'
      ? Y_AXIS_W + INIT_SPACE + selected.idx * groupStride + barW + INTRA + barW / 2
      : dotPoints[selected.idx].x;
    return {
      round:  r,
      score:  perRoundScores[r],
      runAvg: runningAvgs[selected.idx],
      be:     bePerRound[selected.idx],
      type:   selected.type,
      left:   Math.max(4, Math.min(chartWidth - TOOLTIP_W - 4, tipX - TOOLTIP_W / 2)),
    };
  })() : null;

  return (
    <View style={styles.wrapper}>
      {/* Legend */}
      <View style={styles.legend}>
        <Pressable style={styles.legendItem} onPress={() => toggleSeries('score')}>
          <View style={[styles.dot, { backgroundColor: scoreHidden ? `${COLORS.success}44` : COLORS.success }]} />
          <Text style={[styles.legendText, scoreHidden && styles.legendOff]}>Round Score</Text>
        </Pressable>
        <Pressable style={styles.legendItem} onPress={() => toggleSeries('avg')}>
          <View style={[styles.dot, { backgroundColor: avgHidden ? `${AVG_COLOR}44` : AVG_COLOR }]} />
          <Text style={[styles.legendText, avgHidden && styles.legendOff]}>Avg. Score</Text>
        </Pressable>
        {ppts > 0 && (
          <Pressable style={styles.legendItem} onPress={() => toggleSeries('be')}>
            <View style={[styles.dot, { backgroundColor: beHidden ? `${BE_COLOR}44` : BE_COLOR, width: 6, height: 6, borderRadius: 3 }]} />
            <Text style={[styles.legendText, beHidden && styles.legendOff]}>BE</Text>
          </Pressable>
        )}
      </View>

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

        <Svg style={{ position: 'absolute', top: 0, left: 0 }} width={chartWidth} height={CHART_H}>
          {/* Background dismiss — clears selection when tapping empty space */}
          <Rect x={0} y={0} width={chartWidth} height={CHART_H} fill="transparent" onPress={() => setSelected(null)} />

          {/* Per-bar tap targets — score bar and avg bar handled separately */}
          {playedRounds.map((_, idx) => {
            const groupX = Y_AXIS_W + INIT_SPACE + idx * groupStride;
            return (
              <React.Fragment key={`tap-${idx}`}>
                <Rect
                  x={groupX}
                  y={0}
                  width={barW}
                  height={CHART_H}
                  fill="transparent"
                  onPress={() => selectItem(idx, 'score')}
                />
                <Rect
                  x={groupX + barW + INTRA}
                  y={0}
                  width={barW + INTER}
                  height={CHART_H}
                  fill="transparent"
                  onPress={() => selectItem(idx, 'avg')}
                />
              </React.Fragment>
            );
          })}

          {/* BE line */}
          {ppts > 0 && !beHidden && n > 1 && (
            <Polyline
              points={polyPts}
              fill="none"
              stroke={BE_COLOR}
              strokeWidth={1.5}
              strokeDasharray={[4, 2]}
              opacity={selected !== null && selected.type !== 'be' ? 0.25 : 0.85}
            />
          )}

          {/* BE dots */}
          {ppts > 0 && !beHidden && dotPoints.map((p, i) => {
            const dotActive = selected?.idx === i && selected?.type === 'be';
            return (
              <Circle
                key={`dot-${i}`}
                cx={p.x}
                cy={p.y}
                r={dotActive ? 6 : 4}
                fill={BE_COLOR}
                opacity={selected !== null && !dotActive ? 0.2 : 1}
                onPress={() => selectItem(i, 'be')}
              />
            );
          })}
        </Svg>

        {/* Tooltip — single row matching the tapped element */}
        {tip && (
          <View style={[styles.tooltip, { left: tip.left }]} pointerEvents="none">
            <Text style={styles.tipHeader}>Round {tip.round}</Text>
            {tip.type === 'score' && (
              <View style={styles.tipRow}>
                <View style={[styles.tipDot, { backgroundColor: COLORS.success }]} />
                <Text style={styles.tipLabel}>Round Score: </Text>
                <Text style={styles.tipVal}>{tip.score}</Text>
              </View>
            )}
            {tip.type === 'avg' && (
              <View style={styles.tipRow}>
                <View style={[styles.tipDot, { backgroundColor: AVG_COLOR }]} />
                <Text style={styles.tipLabel}>Avg. Score: </Text>
                <Text style={styles.tipVal}>{tip.runAvg}</Text>
              </View>
            )}
            {tip.type === 'be' && (
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
  wrapper:    { marginTop: 4 },
  legend:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot:        { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: COLORS.textMuted },
  legendOff:  { opacity: 0.35 },
  axisText:   { color: COLORS.textMuted, fontSize: 9 },
  tooltip: {
    position:        'absolute',
    top:             4,
    width:           168,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius:    8,
    borderWidth:     1,
    borderColor:     COLORS.border,
    paddingHorizontal: 10,
    paddingVertical:   8,
    gap:             5,
  },
  tipHeader: { fontSize: 11, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 2 },
  tipRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tipDot:    { width: 7, height: 7, borderRadius: 3.5 },
  tipLabel:  { fontSize: 11, color: COLORS.textSecondary },
  tipVal:    { fontSize: 11, fontWeight: '700', color: COLORS.textPrimary },
});
