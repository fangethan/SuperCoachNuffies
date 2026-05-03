import React, { Fragment, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { usePlayers, useByeRounds, useFootywireBreakevens, useMatchList, useMatchupStats, useFixtureProjections, usePlayerRoundBEs } from '../../src/hooks/usePlayers';
import { useRoundScores } from '../../src/hooks/useRoundScores';
import { useAppStore } from '../../src/store/useAppStore';
import { formatPrice, formatPriceChange, getPriceDirection } from '../../src/utils/scoring';
import { COLORS, POSITIONS, CURRENT_YEAR, SC_DOLLARS_PER_POINT, SC_MAGIC } from '../../src/constants';
import { footywireApi, MatchEntry } from '../../src/api/footywire';
import { TeamBadge } from '../../src/components/TeamBadge';
import { PlayerScoreChart } from '../../src/components/PlayerScoreChart';

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const maxRound = useAppStore(s => s.maxRound);
  const { data: players, isLoading } = usePlayers(CURRENT_YEAR, maxRound);
  const { data: byeMap } = useByeRounds(CURRENT_YEAR);
  const { data: fwMap } = useFootywireBreakevens();
  const { data: roundScoresById } = useRoundScores(CURRENT_YEAR, maxRound, players ?? []);
  const { data: matchList } = useMatchList(CURRENT_YEAR);
  const [activeTab, setActiveTab] = useState<'history' | 'fixtures'>('history');

  const player = players?.find(p => String(p.id) === id);
  const stats = player?.player_stats?.[0];
  const playerId = player ? player.id : 0;
  const roundScores = roundScoresById[playerId];
  const lastCompletedRound = Math.max(1, maxRound - 1);
  const lastRoundScore = (roundScores?.lastScore ?? 0) > 0 ? String(roundScores!.lastScore) : 'N/A';

  // Hoist fwPlayer + ppts before hooks so they can be passed as arguments
  const fwPlayerEarly = fwMap ? footywireApi.lookupPlayer(fwMap, player?.first_name ?? '', player?.last_name ?? '') : undefined;
  const pptsEarly = fwPlayerEarly?.breakeven ?? stats?.ppts ?? 0;

  // Compute nextMatch + all fixtures before early returns so hooks are unconditional
  const nextMatch = matchList
    ?.filter(m => (m.homeTeam === player?.team?.name || m.awayTeam === player?.team?.name) && m.homeScore === null)
    .sort((a, b) => a.round - b.round)[0];
  const { data: matchupStats } = useMatchupStats(player, nextMatch);
  const { data: roundBEs } = usePlayerRoundBEs(player, CURRENT_YEAR, pptsEarly);

  const allFixtures = matchList
    ?.filter(m => (m.homeTeam === player?.team?.name || m.awayTeam === player?.team?.name) && m.homeScore === null)
    .sort((a, b) => a.round - b.round) ?? [];
  const { data: fixtureProjections = {} } = useFixtureProjections(
    player,
    allFixtures,
    player?.player_stats?.[0]?.avg3 ?? 0,
    player?.player_stats?.[0]?.avg ?? 0,
  );

  if (isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (!player || !stats) {
    return (
      <View style={styles.centre}>
        <Text style={styles.errorText}>Player not found</Text>
      </View>
    );
  }

  const allPositions = player.positions?.map(p => p.position) ?? ['MID'];
  const pos = allPositions[0];
  const posColor = POSITIONS[pos as keyof typeof POSITIONS]?.color ?? COLORS.primary;
  const isDPP = allPositions.length > 1;
  const weeklyPriceChange = stats.price_change ?? 0;
  const totalPriceChange = stats.total_price_change ?? 0;
  const priceDir = getPriceDirection(weeklyPriceChange);
  const totalPriceDir = getPriceDirection(totalPriceChange);
  const allByeRounds = byeMap?.[player.team?.name ?? ''] ?? [];
  const futureByeRounds = allByeRounds.filter(r => r > maxRound);

  const fwPlayer = fwMap ? footywireApi.lookupPlayer(fwMap, player.first_name, player.last_name) : undefined;

  const fwInjury = fwPlayer?.injuryStatus ?? null;
  const isSusp = fwInjury === 'SUS';
  const isInj = fwInjury === 'INJ';
  const showInjBanner = isSusp || isInj;
  const injuryDetail = fwPlayer?.injuryDetail ?? null;
  const injuryReturning = fwPlayer?.returning ?? null;

  // Prefer footywire breakeven, fall back to SC API ppts
  const ppts = fwPlayer?.breakeven ?? stats.ppts ?? 0;
  const likelihood = fwPlayer?.likelihood ?? null;
  const avg3 = stats.avg3 ?? 0;
  const beStatus = ppts === 0 ? 'unknown' : ppts < 0 ? 'safe' : ppts > avg3 * 1.15 ? 'danger' : ppts > avg3 ? 'warning' : 'safe';

  const avg = stats.avg ?? 0;
  const avg5 = roundScores?.avg5 ?? 0;

  const perRoundScoresRaw = roundScores?.roundScores ?? {};
  const teamMatches = matchList?.filter(
    m => m.homeTeam === player.team.name || m.awayTeam === player.team.name
  ) ?? [];
  const history = [...teamMatches]
    .filter(m => m.homeScore !== null)
    .sort((a, b) => b.round - a.round);
  const fixtures = [...teamMatches]
    .filter(m => m.homeScore === null)
    .sort((a, b) => a.round - b.round);

  // Extend perRoundScores with the next upcoming round (score=0) so the
  // projected BE dot for that round renders on the chart even before it's played.
  const nextRound = fixtures[0]?.round;
  const perRoundScores = nextRound && !perRoundScoresRaw[nextRound]
    ? { ...perRoundScoresRaw, [nextRound]: 0 }
    : perRoundScoresRaw;

  const sortedPlayedRounds = Object.keys(perRoundScores)
    .map(Number)
    .filter(r => perRoundScores[r] > 0)
    .sort((a, b) => a - b);

  const projectedPrices: Record<number, { price: number; delta: number; projScore: number }> = {};
  const basePrice = stats.price ?? 0;

  if (ppts !== 0 && basePrice > 0) {
    // Last two played scores — seed for the 3-game BE rolling window
    const s_n2 = sortedPlayedRounds.length >= 2
      ? perRoundScores[sortedPlayedRounds[sortedPlayedRounds.length - 2]]
      : avg;
    const s_n1 = sortedPlayedRounds.length >= 1
      ? perRoundScores[sortedPlayedRounds[sortedPlayedRounds.length - 1]]
      : avg;

    // BE_n = baseRatio × price_n − s[n-2] − s[n-1]
    // baseRatio is a season-wide constant from the SC formula:
    //   BE = (9 × price / SC_MAGIC) − s[n-2] − s[n-1]
    // i.e. baseRatio = 9 / SC_MAGIC. Previously this was back-fitted per-player
    // from one data point (ppts + s_n2 + s_n1) / basePrice, which only matched
    // SC's actual ratio by luck for premium-priced players.
    const baseRatio = 9 / SC_MAGIC;

    // Footywire uses season avg (not rolling avg) as the forward projection seed
    const gamesCount = stats.games > 0 ? stats.games : sortedPlayedRounds.length;
    const pointsCount = stats.total_points > 0 ? stats.total_points : avg * gamesCount;
    let seasonTotal = pointsCount;
    let seasonGames = gamesCount;

    let chainPrice = basePrice;
    let prevChainPrice = basePrice;
    let chainBE = ppts;
    let be_s_n2 = s_n2;
    let be_s_n1 = s_n1;
    let gamesPlayed = gamesCount;

    for (const m of fixtures) {
      const seasonAvg = seasonGames > 0 ? seasonTotal / seasonGames : avg;

      // Blend season avg with opp/venue context when enough historical data exists (≥3 games)
      const fp = fixtureProjections[m.round];
      const oppAvg = fp?.oppAvg ?? 0;
      const venueAvg = fp?.venueAvg ?? 0;
      const useOpp = (fp?.oppGames ?? 0) >= 3;
      const useVenue = (fp?.venueGames ?? 0) >= 3;
      let projScore: number;
      if (useOpp && useVenue) projScore = seasonAvg * 0.65 + oppAvg * 0.25 + venueAvg * 0.10;
      else if (useOpp)         projScore = seasonAvg * 0.75 + oppAvg * 0.25;
      else if (useVenue)       projScore = seasonAvg * 0.85 + venueAvg * 0.15;
      else                     projScore = seasonAvg;

      // "On the bubble": no price change until the player's 3rd game is played.
      // SC actual formula: priceChange = (score - BE) × SC_MAGIC / 9, flat $/point,
      // independent of the player's price.
      let change = 0;
      if (gamesPlayed >= 2) {
        change = Math.round((projScore - chainBE) * SC_DOLLARS_PER_POINT / 100) * 100;
      }
      const newChainPrice = Math.max(0, chainPrice + change);

      // Update running season total for next round's projection seed
      seasonTotal += projScore;
      seasonGames += 1;
      gamesPlayed += 1;

      // Shift the BE window and compute next round's BE using the fixed ratio
      be_s_n2 = be_s_n1;
      be_s_n1 = projScore;
      chainBE = baseRatio * newChainPrice - be_s_n2 - be_s_n1;

      prevChainPrice = chainPrice;
      chainPrice = newChainPrice;
      projectedPrices[m.round] = { price: chainPrice, delta: chainPrice - prevChainPrice, projScore: Math.round(projScore) };
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: `${player.first_name} ${player.last_name}` }} />
      {/* Header */}
      <View style={styles.header}>
        <TeamBadge teamName={player.team?.name ?? ''} size={46} />
        {isDPP ? (
          <View style={styles.dppRow}>
            {allPositions.map((p, i) => {
              const col = POSITIONS[p as keyof typeof POSITIONS]?.color ?? COLORS.primary;
              return (
                <React.Fragment key={p}>
                  {i > 0 && <Text style={styles.dppSlash}>/</Text>}
                  <View style={[styles.posBadge, { backgroundColor: col }]}>
                    <Text style={styles.posText}>{p}</Text>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        ) : (
          <View style={[styles.posBadge, { backgroundColor: posColor }]}>
            <Text style={styles.posText}>{pos}</Text>
          </View>
        )}
        <Text style={styles.name}>{player.first_name} {player.last_name}</Text>
        <Text style={styles.team}>{player.team?.name ?? ''}</Text>
        {showInjBanner ? (
          <View style={styles.injBanner}>
            <Text style={styles.injBannerLabel}>
              {isSusp ? 'SUSPENDED' : '✚  INJURED'}
            </Text>
            {injuryDetail && !isSusp ? (
              <Text style={styles.injBannerText}>{injuryDetail}</Text>
            ) : null}
            {injuryReturning ? (
              <View style={styles.injReturnRow}>
                <Text style={styles.injReturnLabel}>Returns: </Text>
                <Text style={styles.injReturnValue}>{injuryReturning}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Key stats row */}
      <View style={styles.statsGrid}>
        <StatBox label={`Rnd ${lastCompletedRound}`} value={lastRoundScore} large />
        <StatBox label="Season Avg" value={avg.toFixed(1)} large />
        <StatBox label="3 Rd Avg" value={avg3 > 0 ? avg3.toFixed(1) : 'N/A'} large />
        <StatBox label="5 Rd Avg" value={avg5 > 0 ? avg5.toFixed(1) : 'N/A'} large />
      </View>

      {/* Price row */}
      <View style={styles.priceRow}>
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Price</Text>
          <Text style={styles.priceValue}>{formatPrice(stats.price ?? 0)}</Text>
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Change</Text>
          <Text style={[
            styles.priceValue,
            priceDir === 'up' ? styles.up : priceDir === 'down' ? styles.down : styles.neutral,
          ]}>
            {weeklyPriceChange !== 0 ? formatPriceChange(weeklyPriceChange) : '-'}
          </Text>
          {totalPriceChange !== 0 ? (
            <Text style={[
              styles.priceTotal,
              totalPriceDir === 'up' ? styles.up : totalPriceDir === 'down' ? styles.down : styles.neutral,
            ]}>
              ({formatPriceChange(totalPriceChange)})
            </Text>
          ) : null}
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Owned</Text>
          <Text style={styles.priceValue}>{(stats.owned ?? 0).toFixed(1)}%</Text>
        </View>
      </View>

      {/* Breakeven section */}
      {ppts !== 0 ? (
        <View style={[
          styles.beSection,
          beStatus === 'danger' ? styles.beDanger :
          beStatus === 'warning' ? styles.beWarning : styles.beSafe,
        ]}>
          <View style={styles.beRow}>
            <View>
              <Text style={styles.beLabel}>Breakeven</Text>
              <Text style={[
                styles.beValue,
                beStatus === 'danger' ? styles.down :
                beStatus === 'warning' ? styles.warn : styles.up,
              ]}>
                {ppts}
              </Text>
            </View>
            <View style={styles.beRight}>
              <Text style={styles.beContext}>
                {ppts < 0
                  ? `BE below zero — price rising regardless`
                  : beStatus === 'danger'
                  ? `Needs ${ppts} pts to stop price drop — ${ppts - avg3 > 0 ? `${(ppts - avg3).toFixed(0)} above` : 'at'} 3 Rd Avg`
                  : beStatus === 'warning'
                  ? `Slightly above 3 Rd Avg (${avg3.toFixed(0)}) — price may dip`
                  : `Below 3 Rd Avg (${avg3.toFixed(0)}) — price rising`}
                {likelihood !== null && ppts > 0 ? `\nLikelihood of hitting BE: ${likelihood}%` : ''}
              </Text>
              <View style={[
                styles.bePill,
                beStatus === 'danger' ? styles.bePillDanger :
                beStatus === 'warning' ? styles.bePillWarning : styles.bePillSafe,
              ]}>
                <Text style={styles.bePillText}>
                  {beStatus === 'danger' ? 'TRADE OUT' : beStatus === 'warning' ? 'MONITOR' : 'HOLD / BUY'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* Matchup */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>This Week's Matchup</Text>
        {nextMatch ? (
          <View style={styles.matchupRow}>
            <View style={styles.matchupItem}>
              <Text style={styles.matchupLabel}>vs</Text>
              <Text style={styles.matchupValue}>
                {nextMatch.homeTeam === player.team.name ? nextMatch.awayAbbrev : nextMatch.homeAbbrev}
              </Text>
            </View>
            <View style={styles.matchupItem}>
              <Text style={styles.matchupLabel}>Opp Avg</Text>
              <Text style={[
                styles.matchupValue,
                (matchupStats?.oppAvg ?? 0) > 75 ? styles.up
                  : (matchupStats?.oppAvg ?? 0) > 0 && (matchupStats?.oppAvg ?? 0) < 60 ? styles.down
                  : styles.neutral,
              ]}>
                {(matchupStats?.oppAvg ?? 0) > 0 ? matchupStats!.oppAvg.toFixed(1) : '-'}
              </Text>
            </View>
            <View style={styles.matchupItem}>
              <Text style={styles.matchupLabel}>Venue</Text>
              <Text style={styles.matchupValue}>{shortenVenue(nextMatch.venue) || '-'}</Text>
            </View>
            <View style={styles.matchupItem}>
              <Text style={styles.matchupLabel}>Venue Avg</Text>
              <Text style={styles.matchupValue}>
                {(matchupStats?.venueAvg ?? 0) > 0 ? matchupStats!.venueAvg.toFixed(1) : '-'}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.matchupValue}>No upcoming games</Text>
        )}
      </View>

      {/* Bye info */}
      {futureByeRounds.length > 0 ? (
        <View style={styles.byeBox}>
          <Text style={styles.byeText}>
            {futureByeRounds.length === 1
              ? `Bye: Round ${futureByeRounds[0]}`
              : `Byes: ${futureByeRounds.map(r => `Round ${r}`).join(' & ')}`}
          </Text>
        </View>
      ) : null}

      {/* History / Fixtures */}
      <View style={styles.section}>
        {/* Tab toggle */}
        <View style={hfStyles.tabRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[hfStyles.tabBtn, activeTab === 'history' && hfStyles.tabBtnActive]}
            onPress={() => setActiveTab('history')}
          >
            <Text style={[hfStyles.tabLabel, activeTab === 'history' && hfStyles.tabLabelActive]}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[hfStyles.tabBtn, activeTab === 'fixtures' && hfStyles.tabBtnActive]}
            onPress={() => setActiveTab('fixtures')}
          >
            <Text style={[hfStyles.tabLabel, activeTab === 'fixtures' && hfStyles.tabLabelActive]}>Fixtures</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'history' && (
          <>
            <View style={hfStyles.headerRow}>
              <Text style={[hfStyles.headerCell, { width: 38 }]}>Rnd</Text>
              <Text style={[hfStyles.headerCell, { width: 82 }]}>Opponent</Text>
              <Text style={[hfStyles.headerCell, { flex: 1 }]}>Venue</Text>
              <Text style={[hfStyles.headerCell, { width: 80 }]}>Result</Text>
              <Text style={[hfStyles.headerCell, { width: 32 }]}>SC</Text>
            </View>
            {history.length === 0 ? (
              <Text style={hfStyles.empty}>No completed games yet</Text>
            ) : history.map(m => {
              const isHome = m.homeTeam === player.team.name;
              const oppAbbrev = isHome ? m.awayAbbrev : m.homeAbbrev;
              const oppTeamName = isHome ? m.awayTeam : m.homeTeam;
              const myScore  = isHome ? m.homeScore! : m.awayScore!;
              const oppScore = isHome ? m.awayScore! : m.homeScore!;
              const result   = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D';
              const sc       = perRoundScores[m.round] ?? 0;
              return (
                <View key={m.round} style={hfStyles.row}>
                  <Text style={[hfStyles.cell, { width: 38, textAlign: 'center' }]}>{m.round}</Text>
                  <View style={[hfStyles.oppCell, { width: 82 }]}>
                    <TeamBadge teamName={oppTeamName} size={16} />
                    <Text style={hfStyles.cell}>{oppAbbrev} ({isHome ? 'H' : 'A'})</Text>
                  </View>
                  <Text style={[hfStyles.cell, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{shortenVenue(m.venue)}</Text>
                  <View style={{ width: 80, alignItems: 'center' }}>
                    <View style={[hfStyles.pill,
                      result === 'W' ? hfStyles.pillWin : result === 'L' ? hfStyles.pillLoss : hfStyles.pillDraw,
                    ]}>
                      <Text style={hfStyles.pillText}>{myScore}-{oppScore}</Text>
                    </View>
                  </View>
                  <Text style={[hfStyles.cell, { width: 32, textAlign: 'center' }]}>
                    {sc > 0 ? sc : '-'}
                  </Text>
                </View>
              );
            })}
          </>
        )}

        {activeTab === 'fixtures' && (
          <>
            <View style={hfStyles.headerRow}>
              <Text style={[hfStyles.headerCell, { width: 34 }]}>Rnd</Text>
              <Text style={[hfStyles.headerCell, { width: 76 }]}>Opponent</Text>
              <Text style={[hfStyles.headerCell, { flex: 1 }]}>Venue</Text>
              <Text style={[hfStyles.headerCell, { width: 54, textAlign: 'right' }]}>Proj Pts</Text>
              <Text style={[hfStyles.headerCell, { width: 68, textAlign: 'right' }]}>Proj $</Text>
            </View>
            {fixtures.length === 0 ? (
              <Text style={hfStyles.empty}>No remaining fixtures</Text>
            ) : fixtures.map(m => {
              const isHome    = m.homeTeam === player.team.name;
              const oppAbbrev = isHome ? m.awayAbbrev : m.homeAbbrev;
              const oppTeamName = isHome ? m.awayTeam : m.homeTeam;
              const proj      = projectedPrices[m.round];
              const projColor = !proj ? COLORS.textMuted
                : proj.delta > 0 ? COLORS.success
                : proj.delta < 0 ? COLORS.danger
                : COLORS.textMuted;
              return (
                <View key={m.round} style={hfStyles.row}>
                  <Text style={[hfStyles.cell, { width: 34, textAlign: 'center' }]}>{m.round}</Text>
                  <View style={[hfStyles.oppCell, { width: 76 }]}>
                    <TeamBadge teamName={oppTeamName} size={16} />
                    <Text style={hfStyles.cell}>{oppAbbrev} ({isHome ? 'H' : 'A'})</Text>
                  </View>
                  <Text style={[hfStyles.cell, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{shortenVenue(m.venue)}</Text>
                  <Text style={[hfStyles.cell, { width: 54, textAlign: 'right', color: COLORS.warning, fontWeight: '700' }]}>
                    {proj ? proj.projScore : '-'}
                  </Text>
                  <View style={{ width: 68, alignItems: 'flex-end' }}>
                    {proj ? (
                      <>
                        <Text style={[hfStyles.cell, { color: projColor, fontWeight: '700' }]}>
                          {formatPrice(proj.price)}
                        </Text>
                        <Text style={{ fontSize: 9, color: projColor }}>
                          {formatPriceChange(proj.delta)}
                        </Text>
                      </>
                    ) : (
                      <Text style={[hfStyles.cell, { color: COLORS.textMuted }]}>-</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </View>

      {/* Score chart — only render once there are played rounds */}
      {Object.keys(perRoundScores).some(r => perRoundScores[Number(r)] > 0) ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Score History</Text>
          <PlayerScoreChart
            perRoundScores={perRoundScores}
            perRoundBE={roundBEs}
            avg={avg}
            ppts={ppts}
          />
        </View>
      ) : null}

      {/* Previous season — only show when data is available */}
      {(player.previous_games ?? 0) > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Previous Season</Text>
          <View style={styles.prevSeason}>
            <StatBox label="Games" value={String(player.previous_games)} />
            <StatBox label="Average" value={(player.previous_average ?? 0).toFixed(1)} highlight />
            <StatBox label="Total" value={String(player.previous_total)} />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function shortenVenue(v: string): string {
  return v.replace(/ Stadium$/, '').replace(/ Arena$/, '').replace(/ Oval$/, '').replace(/ Park$/, '');
}

function StatBox({ label, value, large, highlight }: {
  label: string; value: string; large?: boolean; highlight?: boolean;
}) {
  return (
    <View style={[boxStyles.box, highlight ? boxStyles.highlight : null]}>
      <Text
        style={[
          boxStyles.value,
          large ? boxStyles.valueLarge : null,
          highlight ? boxStyles.valueHighlight : null,
        ]}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text style={boxStyles.label} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const boxStyles = StyleSheet.create({
  box: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 6,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
    marginRight: 8,
  },
  highlight: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '11' },
  value: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, width: '100%', textAlign: 'center' },
  valueLarge: { fontSize: 22 },
  valueHighlight: { color: COLORS.primary },
  label: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, width: '100%', textAlign: 'center' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  errorText: { color: COLORS.danger },
  header: { alignItems: 'center', marginBottom: 16 },
  posBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginTop: 12, marginBottom: 2 },
  posText: { fontWeight: '800', fontSize: 13, color: '#fff' },
  dppRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 2 },
  dppSlash: { fontSize: 16, fontWeight: '300', color: COLORS.textMuted, marginHorizontal: 4 },
  name: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center', marginTop: 2 },
  team: { fontSize: 15, color: COLORS.textSecondary, marginTop: 2 },
  injBanner: {
    backgroundColor: COLORS.danger + '22', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 10,
    borderWidth: 1, borderColor: COLORS.danger + '44',
    alignItems: 'center', minWidth: 200,
  },
  injBannerLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.danger,
    letterSpacing: 1, marginBottom: 4,
  },
  injBannerText: { color: COLORS.danger, fontWeight: '600', fontSize: 14, textAlign: 'center', marginBottom: 6 },
  injReturnRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  injReturnLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  injReturnValue: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '700' },
  warn: { color: COLORS.warning },
  statsGrid: { flexDirection: 'row', marginBottom: 12 },
  priceRow: {
    flexDirection: 'row', marginBottom: 16,
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  priceBox: { flex: 1, alignItems: 'center' },
  priceLabel: { fontSize: 10, color: COLORS.textMuted, marginBottom: 2 },
  priceValue: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  priceTotal: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  up: { color: COLORS.success },
  down: { color: COLORS.danger },
  neutral: { color: COLORS.textSecondary },
  section: {
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 12 },
  matchupRow: { flexDirection: 'row', alignItems: 'flex-start' },
  matchupItem: { flex: 1, alignItems: 'center' },
  matchupLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 3 },
  matchupValue: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  byeBox: {
    backgroundColor: COLORS.warning + '22', borderRadius: 10,
    padding: 12, marginBottom: 12, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.warning + '44',
  },
  byeText: { color: COLORS.warning, fontWeight: '700', fontSize: 14 },
  prevSeason: { flexDirection: 'row' },

  // Breakeven section
  beSection: {
    borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1,
  },
  beSafe: { backgroundColor: COLORS.success + '11', borderColor: COLORS.success + '33' },
  beWarning: { backgroundColor: COLORS.warning + '11', borderColor: COLORS.warning + '33' },
  beDanger: { backgroundColor: COLORS.danger + '11', borderColor: COLORS.danger + '33' },
  beRow: { flexDirection: 'row', alignItems: 'center' },
  beLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 2 },
  beValue: { fontSize: 28, fontWeight: '800' },
  beRight: { flex: 1, marginLeft: 16 },
  beContext: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 8 },
  bePill: {
    alignSelf: 'flex-start', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  bePillSafe: { backgroundColor: COLORS.success + '22' },
  bePillWarning: { backgroundColor: COLORS.warning + '22' },
  bePillDanger: { backgroundColor: COLORS.danger + '22' },
  bePillText: { fontSize: 11, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: 0.5 },
});

const hfStyles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6,
  },
  tabBtnActive: { backgroundColor: COLORS.surface },
  tabLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  tabLabelActive: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  headerRow: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 2,
  },
  headerCell: {
    fontSize: 10, fontWeight: '700', textAlign: 'center',
    color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '55',
  },
  cell: { fontSize: 13, color: COLORS.textPrimary },
  oppCell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  pill: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    alignItems: 'center', justifyContent: 'center', minWidth: 64,
  },
  pillWin:  { backgroundColor: COLORS.success + '33', borderWidth: 1, borderColor: COLORS.success },
  pillLoss: { backgroundColor: COLORS.danger  + '33', borderWidth: 1, borderColor: COLORS.danger  },
  pillDraw: { backgroundColor: '#1e3a5f',              borderWidth: 1, borderColor: '#4a7fa5'      },
  pillText: { fontSize: 11, fontWeight: '800', color: COLORS.textPrimary },
  empty: { fontSize: 13, color: COLORS.textMuted, paddingTop: 12, textAlign: 'center' },
});
