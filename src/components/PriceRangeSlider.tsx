import React, { useRef, useState } from 'react';
import { View, Text, PanResponder, StyleSheet, LayoutChangeEvent } from 'react-native';
import { COLORS } from '../constants';

interface Props {
  min: number;
  max: number;
  low: number;
  high: number;
  step?: number;
  formatValue?: (v: number) => string;
  onLowChange: (v: number) => void;
  onHighChange: (v: number) => void;
}

const THUMB_D = 24;
const TRACK_H = 4;
const ROW_H   = 36;

export function PriceRangeSlider({ min, max, low, high, step = 0.1, formatValue, onLowChange, onHighChange }: Props) {
  const [width, setWidth] = useState(0);

  // Refs so PanResponder closures always see the latest value
  const lowRef    = useRef(low);
  const highRef   = useRef(high);
  const widthRef  = useRef(width);
  const onLowRef  = useRef(onLowChange);
  const onHighRef = useRef(onHighChange);
  lowRef.current    = low;
  highRef.current   = high;
  widthRef.current  = width;
  onLowRef.current  = onLowChange;
  onHighRef.current = onHighChange;

  const startLow  = useRef(low);
  const startHigh = useRef(high);

  const snap  = (v: number) => Math.round(Math.round(v / step) * step * 10) / 10;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const lowPR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startLow.current = lowRef.current; },
      onPanResponderMove: (_, { dx }) => {
        const w = widthRef.current;
        if (w === 0) return;
        const v = snap(clamp(startLow.current + (dx / w) * (max - min), min, highRef.current - step));
        if (v !== lowRef.current) onLowRef.current(v);
      },
    })
  ).current;

  const highPR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startHigh.current = highRef.current; },
      onPanResponderMove: (_, { dx }) => {
        const w = widthRef.current;
        if (w === 0) return;
        const v = snap(clamp(startHigh.current + (dx / w) * (max - min), lowRef.current + step, max));
        if (v !== highRef.current) onHighRef.current(v);
      },
    })
  ).current;

  const toX  = (v: number) => width > 0 ? ((v - min) / (max - min)) * width : 0;
  const lowX  = toX(low);
  const highX = toX(high);
  const fmt = formatValue ?? ((v: number) => `$${v.toFixed(1)}k`);

  return (
    <View>
      <Text style={s.label}>{fmt(low)} – {fmt(high)}</Text>
      <View
        style={s.row}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      >
        <View style={s.track} />
        <View style={[s.fill, { left: lowX, width: Math.max(0, highX - lowX) }]} />
        {width > 0 && (
          <>
            <View style={[s.thumb, { left: lowX - THUMB_D / 2 }]} {...lowPR.panHandlers} />
            <View style={[s.thumb, { left: highX - THUMB_D / 2 }]} {...highPR.panHandlers} />
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 14 },
  row: { height: ROW_H, justifyContent: 'center', position: 'relative' },
  track: {
    position: 'absolute', left: 0, right: 0,
    height: TRACK_H, backgroundColor: COLORS.border, borderRadius: 2,
  },
  fill: {
    position: 'absolute', height: TRACK_H,
    backgroundColor: COLORS.primary, borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: (ROW_H - THUMB_D) / 2,
    width: THUMB_D, height: THUMB_D, borderRadius: THUMB_D / 2,
    backgroundColor: COLORS.primary,
    borderWidth: 2.5, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 3, elevation: 4,
  },
});
