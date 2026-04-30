import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  Pressable, StyleSheet,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { COLORS } from '../constants';

export function RoundPicker() {
  const [open, setOpen] = useState(false);
  const { currentRound, maxRound, setCurrentRound } = useAppStore();

  const rounds = Array.from({ length: maxRound }, (_, i) => maxRound - i);

  return (
    <>
      <TouchableOpacity style={styles.pill} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Text style={styles.pillText}>RND {currentRound}  ▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Select Round</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
              {rounds.map(r => {
                const active = r === currentRound;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.item, active && styles.itemActive]}
                    onPress={() => { setCurrentRound(r); setOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.itemText, active && styles.itemTextActive]}>
                      Round {r}
                    </Text>
                    {active && <Text style={styles.check}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: COLORS.primary + '22',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginRight: 12,
  },
  pillText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 220,
    maxHeight: 420,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  list: { flexGrow: 0 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  itemActive: {
    backgroundColor: COLORS.primary + '18',
  },
  itemText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  itemTextActive: {
    color: COLORS.primary,
  },
  check: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '700',
  },
});
