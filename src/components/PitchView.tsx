import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, useWindowDimensions, Alert,
} from 'react-native';
import Svg, { Ellipse, Circle, Rect, Line } from 'react-native-svg';
import { Player } from '../types';
import { PitchCard } from './PitchCard';
import { COLORS } from '../constants';

// Position display colours (on-pitch pill labels)
const POS_COLORS: Record<string, string> = {
  DEF:   '#4FC3F7',
  MID:   '#AB47BC',
  RUC:   '#FFB300',
  FWD:   '#EF5350',
  FLEX:  '#30D158',
  BENCH: '#9E9E9E',
};

// Sort order for bench grouping
const POS_ORDER: Record<string, number> = { DEF: 0, MID: 1, RUC: 2, FWD: 3 };

interface Props {
  players: Player[];
  benchIds: number[];
  captainId: number | null;
  vcId: number | null;
  roundScores: Record<number, number>;
  scPositions: Record<number, string>;
  emgIds: number[];
  onPlayerPress: (player: Player) => void;
  onSetCaptain: (id: number) => void;
  onSetVC: (id: number) => void;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getPos(player: Player, scPositions: Record<number, string>): string {
  return scPositions[player.id] ?? player.positions?.[0]?.position ?? 'MID';
}

function PosPill({ label }: { label: string }) {
  const color = POS_COLORS[label] ?? '#fff';
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={styles.pillText}>{label}</Text>
      {label === 'FLEX' && (
        <View style={styles.infoCircle}>
          <Text style={styles.infoText}>i</Text>
        </View>
      )}
    </View>
  );
}

function CardRow({ players, captainId, vcId, roundScores, scPositions, onPress }: {
  players: Player[];
  captainId: number | null;
  vcId: number | null;
  roundScores: Record<number, number>;
  scPositions: Record<number, string>;
  onPress: (p: Player) => void;
}) {
  return (
    <View style={styles.cardRow}>
      {players.map(p => (
        <PitchCard
          key={p.id}
          player={p}
          isCaptain={p.id === captainId}
          isVC={p.id === vcId}
          lastScore={roundScores[p.id] ?? null}
          onPress={() => onPress(p)}
        />
      ))}
    </View>
  );
}

function PosGroup({ label, players, captainId, vcId, roundScores, scPositions, onPress }: {
  label: string;
  players: Player[];
  captainId: number | null;
  vcId: number | null;
  roundScores: Record<number, number>;
  scPositions: Record<number, string>;
  onPress: (p: Player) => void;
}) {
  if (players.length === 0) return null;
  const rows = chunk(players, 3);
  return (
    <View style={styles.posGroup}>
      <PosPill label={label} />
      {rows.map((row, i) => (
        <CardRow
          key={i}
          players={row}
          captainId={captainId}
          vcId={vcId}
          roundScores={roundScores}
          scPositions={scPositions}
          onPress={onPress}
        />
      ))}
    </View>
  );
}

export function PitchView({
  players,
  benchIds,
  captainId,
  vcId,
  roundScores,
  scPositions,
  emgIds,
  onPlayerPress,
  onSetCaptain,
  onSetVC,
}: Props) {
  const { width, height } = useWindowDimensions();

  const pitchBase  = '#2D6A4F';
  const pitchInner = '#336B52';
  const lineColor  = 'rgba(255,255,255,0.22)';

  // Group players by SC-assigned position
  const byPos: Record<string, Player[]> = { DEF: [], MID: [], RUC: [], FWD: [] };
  const flexPlayers: Player[] = [];
  const bench: Player[] = [];

  players.forEach(p => {
    if (benchIds.includes(p.id)) {
      bench.push(p);
      return;
    }
    const pos = getPos(p, scPositions);
    if (pos === 'FLEX') {
      flexPlayers.push(p);
    } else if (byPos[pos]) {
      byPos[pos].push(p);
    } else {
      // Unknown position → treat as MID
      byPos.MID.push(p);
    }
  });

  // Sort bench: by position order (DEF→MID→RUC→FWD), EMG first within each group
  const sortedBench = [...bench].sort((a, b) => {
    const aPosOrder = POS_ORDER[getPos(a, scPositions)] ?? 4;
    const bPosOrder = POS_ORDER[getPos(b, scPositions)] ?? 4;
    if (aPosOrder !== bPosOrder) return aPosOrder - bPosOrder;
    return (emgIds.includes(a.id) ? 0 : 1) - (emgIds.includes(b.id) ? 0 : 1);
  });

  function handleCardPress(player: Player) {
    Alert.alert(
      `${player.first_name} ${player.last_name}`,
      `${player.team?.abbrev ?? ''} · ${getPos(player, scPositions)}`,
      [
        {
          text: captainId === player.id ? 'Remove Captain' : 'Set as Captain',
          onPress: () => onSetCaptain(captainId === player.id ? -1 : player.id),
        },
        {
          text: vcId === player.id ? 'Remove Vice-Captain' : 'Set as Vice-Captain',
          onPress: () => onSetVC(vcId === player.id ? -1 : player.id),
        },
        { text: 'View Profile', onPress: () => onPlayerPress(player) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  // SVG oval fills entire visible area as a fixed background
  const svgH = height * 1.15;
  const cx = width / 2;
  const cy = svgH / 2;
  const rx = width / 2 - 6;
  const ry = svgH / 2 - 14;

  return (
    <View style={[styles.root, { backgroundColor: pitchBase }]}>
      {/* Fixed oval background */}
      <Svg
        width={width}
        height={svgH}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      >
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={pitchInner} />
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={lineColor} strokeWidth={2} />
        <Line x1={6} y1={cy} x2={width - 6} y2={cy} stroke={lineColor} strokeWidth={1} />
        <Rect x={cx - 55} y={cy - 55} width={110} height={110} fill="none" stroke={lineColor} strokeWidth={1} />
        <Circle cx={cx} cy={cy} r={55} fill="none" stroke={lineColor} strokeWidth={1} />
        <Circle cx={cx} cy={cy} r={3.5} fill={lineColor} />
        {/* 50m arcs — dashed ellipse halves */}
        <Ellipse cx={cx} cy={cy * 0.38} rx={rx * 0.68} ry={ry * 0.16}
          fill="none" stroke={lineColor} strokeWidth={1} strokeDasharray="6,5" />
        <Ellipse cx={cx} cy={cy * 1.62} rx={rx * 0.68} ry={ry * 0.16}
          fill="none" stroke={lineColor} strokeWidth={1} strokeDasharray="6,5" />
        {/* Goal squares */}
        <Rect x={cx - 22} y={10} width={44} height={28} fill="none" stroke={lineColor} strokeWidth={1} />
        <Rect x={cx - 22} y={svgH - 38} width={44} height={28} fill="none" stroke={lineColor} strokeWidth={1} />
      </Svg>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* DEF */}
        <PosGroup label="DEF" players={byPos.DEF}
          captainId={captainId} vcId={vcId} roundScores={roundScores}
          scPositions={scPositions} onPress={handleCardPress} />

        {/* MID */}
        <PosGroup label="MID" players={byPos.MID}
          captainId={captainId} vcId={vcId} roundScores={roundScores}
          scPositions={scPositions} onPress={handleCardPress} />

        {/* RUC */}
        <PosGroup label="RUC" players={byPos.RUC}
          captainId={captainId} vcId={vcId} roundScores={roundScores}
          scPositions={scPositions} onPress={handleCardPress} />

        {/* FWD */}
        <PosGroup label="FWD" players={byPos.FWD}
          captainId={captainId} vcId={vcId} roundScores={roundScores}
          scPositions={scPositions} onPress={handleCardPress} />

        {/* FLEX */}
        {flexPlayers.length > 0 && (
          <View style={styles.posGroup}>
            <PosPill label="FLEX" />
            <CardRow players={flexPlayers} captainId={captainId} vcId={vcId}
              roundScores={roundScores} scPositions={scPositions} onPress={handleCardPress} />
          </View>
        )}

        {/* BENCH */}
        {sortedBench.length > 0 && (
          <View style={styles.benchPanel}>
            <Text style={styles.benchTitle}>BENCH</Text>
            <View style={styles.benchGrid}>
              {sortedBench.map((player, i) => {
                const isEmg = emgIds.includes(player.id);
                const posLabel = getPos(player, scPositions);
                return (
                  <View key={player.id} style={styles.benchItem}>
                    {/* Number + EMG row */}
                    <View style={styles.benchBadgeRow}>
                      <View style={styles.benchNumBadge}>
                        <Text style={styles.benchNum}>{i + 1}</Text>
                      </View>
                      {isEmg && (
                        <View style={styles.emgBadge}>
                          <Text style={styles.emgText}>EMG</Text>
                        </View>
                      )}
                    </View>
                    <PitchCard
                      player={player}
                      isCaptain={player.id === captainId}
                      isVC={player.id === vcId}
                      lastScore={roundScores[player.id] ?? null}
                      onPress={() => handleCardPress(player)}
                    />
                    <Text style={styles.benchPos}>{posLabel}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 32 },

  posGroup: { alignItems: 'center', marginBottom: 14 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 4,
    gap: 6, marginBottom: 2,
    backgroundColor: 'rgba(10,14,26,0.85)',
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: '#fff' },
  infoCircle: {
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  infoText: { fontSize: 9, color: '#8E8E93', fontWeight: '700' },

  cardRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 10, marginTop: 8,
  },

  // Bench
  benchPanel: {
    backgroundColor: 'rgba(10,10,18,0.88)',
    borderRadius: 14, padding: 14, paddingTop: 12,
    borderWidth: 1, borderColor: COLORS.border,
    marginTop: 6,
  },
  benchTitle: {
    fontSize: 11, fontWeight: '800', color: '#9E9E9E',
    letterSpacing: 1.5, textAlign: 'center', marginBottom: 12,
  },
  benchGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 14,
  },
  benchItem: { alignItems: 'center', width: 72 },
  benchBadgeRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 4, marginBottom: 4, minHeight: 18,
  },
  benchNumBadge: {
    backgroundColor: 'rgba(99,99,102,0.3)', borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 1,
    borderWidth: 1, borderColor: '#636366',
  },
  benchNum: { fontSize: 9, color: '#9E9E9E', fontWeight: '700' },
  emgBadge: {
    backgroundColor: '#7B2FBE',
    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1,
  },
  emgText: { fontSize: 9, color: '#fff', fontWeight: '800', letterSpacing: 0.3 },
  benchPos: {
    fontSize: 9, color: '#9E9E9E', fontWeight: '600',
    letterSpacing: 0.5, marginTop: 4, textAlign: 'center',
  },
});
