import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
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
const N_SECTIONS = 4;

type Series   = 'score' | 'avg' | 'be';
type Selected = { idx: number; type: Series } | null;

export function PlayerScoreChart({ perRoundScores, perRoundBE, avg, ppts }: Props) {
  const [selected, setSelected] = useState<Selected>(null);
  const [hidden,   setHidden]   = useState<Set<Series>>(new Set());
  const [containerW, setContainerW] = useState(0);

  const toggleSeries = (s: Series) =>
    setHidden(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const selectItem = (idx: number, type: Series) =>
    setSelected(prev => prev?.idx === idx && prev?.type === type ? null : { idx, type });

  // All rounds: include round 0 and non-played rounds (score = 0)
  const allRounds = useMemo(() =>
    Object.keys(perRoundScores)
      .map(Number)
      .filter(r => r >= 0)
      .sort((a, b) => a - b),
    [perRoundScores],
  );
  const n = allRounds.length;

  // Use measured container width; fall back to 0 until first layout pass
  const chartWidth  = containerW > 0 ? containerW : 0;
  const available   = chartWidth - Y_AXIS_W - INIT_SPACE;
  const barW        = Math.max(3, Math.min(8,
    Math.floor((available - (INTRA + INTER) * n) / (n * 2)),
  ));
  const groupStride = 2 * barW + INTRA + INTER;

  // Running avg: only counts played rounds; stagnant for non-played
  const runningAvgs = useMemo(() => {
    let sum = 0, count = 0;
    return allRounds.map(r => {
      const s = perRoundScores[r];
      if (s > 0) { sum += s; count++; }
      return count > 0 ? Math.round(sum / count) : 0;
    });
  }, [allRounds, perRoundScores]);

  // BE per round: from fetched price data for played rounds, stagnant for non-played.
  // Returns null for rounds before the first known BE (avoids misleading stagnant 0s).
  const bePerRound = useMemo(() => {
    const playedOnly = allRounds.filter(r => perRoundScores[r] > 0);
    const lastPlayedRound = playedOnly.length > 0 ? playedOnly[playedOnly.length - 1] : -1;
    const beByRound = new Map<number, number>();
    playedOnly.forEach((r, idx) => {
      // Prefer fetched price-derived BE; fall back to 3-game window only when ppts is known
      if (perRoundBE?.[r] !== undefined) {
        beByRound.set(r, perRoundBE[r]);
      } else if (ppts > 0) {
        const be = idx >= 3
          ? perRoundScores[playedOnly[idx - 3]]
          : idx > 0
            ? Math.round(playedOnly.slice(0, idx).reduce((s, pr) => s + perRoundScores[pr], 0) / 3)
            : ppts;
        beByRound.set(r, be);
      }
    });

    // Walk forward: carry the last known BE; emit null until the first data point.
    // For rounds AFTER the last played round (upcoming), show the current published
    // ppts directly — do not carry forward the previous round's computed BE.
    let last: number | null = ppts > 0 ? ppts : null;
    return allRounds.map(r => {
      if (beByRound.has(r)) last = beByRound.get(r)!;
      if (r > lastPlayedRound && ppts > 0) return ppts;
      return last;
    });
  }, [allRounds, perRoundScores, perRoundBE, ppts]);

  const scoreHidden = hidden.has('score');
  const avgHidden   = hidden.has('avg');
  const beHidden    = hidden.has('be');

  const playedRoundsOnly = allRounds.filter(r => perRoundScores[r] > 0);
  const maxScore = playedRoundsOnly.length > 0
    ? Math.max(...playedRoundsOnly.map(r => perRoundScores[r]))
    : avg > 0 ? avg : 100;
  const knownBEs = bePerRound.filter((v): v is number => v !== null);
  const hasAnyBE = knownBEs.length > 0;
  const maxBE = hasAnyBE ? Math.max(0, ...knownBEs) : 0;
  const minBE = hasAnyBE ? Math.min(0, ...knownBEs) : 0;
  const maxY  = Math.ceil(Math.max(maxScore, avg * 1.1, maxBE) / 20) * 20 || 100;

  const stepValue  = maxY / N_SECTIONS;
  const stepHeight = CHART_H / N_SECTIONS;

  const noOfSectionsBelowXAxis = minBE < 0
    ? Math.ceil(-minBE / stepValue)
    : 0;
  const negChartH = noOfSectionsBelowXAxis * stepHeight;

  const toY = (val: number) => {
    if (val >= 0) return CHART_H * (1 - val / maxY);
    return CHART_H + (-val / stepValue) * stepHeight;
  };

  const chartData = useMemo(() => {
    const data: any[] = [];
    allRounds.forEach((r, idx) => {
      const isLast      = idx === n - 1;
      const isPlayed    = perRoundScores[r] > 0;
      const scoreActive = selected?.idx === idx && selected?.type === 'score';
      const avgActive   = selected?.idx === idx && selected?.type === 'avg';
      const anySelected = selected !== null;
      const runAvg      = runningAvgs[idx];

      data.push({
        value:      isPlayed ? perRoundScores[r] : 0,
        frontColor: !isPlayed ? 'transparent'
          : scoreHidden ? `${COLORS.success}18`
          : anySelected && !scoreActive ? `${COLORS.success}28` : COLORS.success,
        label:      String(r),
        spacing:    INTRA,
        barWidth:   barW,
      });
      data.push({
        value:      isPlayed && runAvg > 0 ? runAvg : 0,
        frontColor: !isPlayed || runAvg === 0 ? 'transparent'
          : avgHidden ? `${AVG_COLOR}18`
          : anySelected && !avgActive ? `${AVG_COLOR}28` : AVG_COLOR,
        label:      '',
        spacing:    isLast ? 0 : INTER,
        barWidth:   barW,
      });
    });
    return data;
  }, [allRounds, perRoundScores, runningAvgs, barW, n, selected, scoreHidden, avgHidden]);

  // All hooks above — safe to return early now
  if (n === 0) return null;
  if (chartWidth === 0) {
    return <View style={styles.wrapper} onLayout={e => setContainerW(e.nativeEvent.layout.width)} />;
  }

  // Only include rounds with a known BE value in the dots/polyline
  const dotPoints = allRounds
    .map((_, idx) => {
      const be = bePerRound[idx];
      if (be === null) return null;
      return { x: Y_AXIS_W + INIT_SPACE + idx * groupStride + barW + INTRA / 2, y: toY(be), idx };
    })
    .filter((p): p is { x: number; y: number; idx: number } => p !== null);
  const polyPts = dotPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const TOOLTIP_W = 168;
  const tip = selected !== null ? (() => {
    const r    = allRounds[selected.idx];
    const dot  = dotPoints.find(p => p.idx === selected.idx);
    const tipX = selected.type === 'score'
      ? Y_AXIS_W + INIT_SPACE + selected.idx * groupStride + barW / 2
      : selected.type === 'avg'
      ? Y_AXIS_W + INIT_SPACE + selected.idx * groupStride + barW + INTRA + barW / 2
      : (dot?.x ?? 0);
    const be = bePerRound[selected.idx];
    return {
      round:  r,
      score:  perRoundScores[r],
      runAvg: runningAvgs[selected.idx],
      be:     be ?? 0,
      type:   selected.type,
      left:   Math.max(4, Math.min(chartWidth - TOOLTIP_W - 4, tipX - TOOLTIP_W / 2)),
    };
  })() : null;

  const svgHeight = CHART_H + negChartH;

  return (
    <View style={styles.wrapper} onLayout={e => setContainerW(e.nativeEvent.layout.width)}>
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
        {hasAnyBE && (
          <Pressable style={styles.legendItem} onPress={() => toggleSeries('be')}>
            <View style={[styles.dot, { backgroundColor: beHidden ? `${BE_COLOR}44` : BE_COLOR, width: 6, height: 6, borderRadius: 3 }]} />
            <Text style={[styles.legendText, beHidden && styles.legendOff]}>BE</Text>
          </Pressable>
        )}
      </View>

      <View>
        <BarChart
          data={chartData}
          width={chartWidth - Y_AXIS_W}
          height={CHART_H}
          spacing={INTER}
          yAxisLabelWidth={Y_AXIS_W}
          roundedTop
          hideRules
          maxValue={maxY}
          noOfSections={N_SECTIONS}
          noOfSectionsBelowXAxis={noOfSectionsBelowXAxis}
          negativeStepValue={noOfSectionsBelowXAxis > 0 ? stepValue : undefined}
          negativeStepHeight={noOfSectionsBelowXAxis > 0 ? stepHeight : undefined}
          xAxisColor={COLORS.border}
          yAxisColor="transparent"
          yAxisTextStyle={styles.axisText}
          xAxisLabelTextStyle={styles.axisText}
          backgroundColor="transparent"
          isAnimated
          animationDuration={300}
          disableScroll
        />

        <Svg style={{ position: 'absolute', top: 0, left: 0 }} width={chartWidth} height={svgHeight}>
          {/* Background dismiss */}
          <Rect x={0} y={0} width={chartWidth} height={svgHeight} fill="transparent" onPress={() => setSelected(null)} />

          {/* Per-bar tap targets — only for played rounds */}
          {allRounds.map((r, idx) => {
            if (perRoundScores[r] === 0) return null;
            const groupX = Y_AXIS_W + INIT_SPACE + idx * groupStride;
            return (
              <React.Fragment key={`tap-${idx}`}>
                <Rect
                  x={groupX} y={0} width={barW} height={CHART_H}
                  fill="transparent"
                  onPress={() => selectItem(idx, 'score')}
                />
                <Rect
                  x={groupX + barW + INTRA} y={0} width={barW + INTER} height={CHART_H}
                  fill="transparent"
                  onPress={() => selectItem(idx, 'avg')}
                />
              </React.Fragment>
            );
          })}

          {/* BE line */}
          {hasAnyBE && !beHidden && dotPoints.length > 1 && (
            <Polyline
              points={polyPts}
              fill="none"
              stroke={BE_COLOR}
              strokeWidth={1.5}
              strokeDasharray={[4, 2]}
              opacity={selected !== null && selected.type !== 'be' ? 0.25 : 0.85}
            />
          )}

          {/* BE dots — visible dot + large transparent tap target on top */}
          {hasAnyBE && !beHidden && dotPoints.map((p) => {
            const dotActive = selected?.idx === p.idx && selected?.type === 'be';
            return (
              <React.Fragment key={`dot-${p.idx}`}>
                <Circle
                  cx={p.x} cy={p.y}
                  r={dotActive ? 6 : 4}
                  fill={BE_COLOR}
                  opacity={selected !== null && !dotActive ? 0.2 : 1}
                />
                {/* 32px diameter transparent hit target for easier tapping */}
                <Circle
                  cx={p.x} cy={p.y}
                  r={16}
                  fill="transparent"
                  onPress={() => selectItem(p.idx, 'be')}
                />
              </React.Fragment>
            );
          })}
        </Svg>

        {/* Tooltip */}
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
