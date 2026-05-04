import React, { Fragment, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { usePlayers, useByeRounds, useFootywireBreakevens, useMatchList, useMatchupStats, useFixtureProjections, usePlayerRoundBEs, usePlayerHistoricalStats } from '../../src/hooks/usePlayers';
import { useRoundScores } from '../../src/hooks/useRoundScores';
import { useAppStore } from '../../src/store/useAppStore';
import { formatPrice, formatPriceChange, getPriceDirection } from '../../src/utils/scoring';
import { COLORS, POSITIONS, CURRENT_YEAR, SC_DOLLARS_PER_POINT, SC_MAGIC } from '../../src/constants';
import { footywireApi, MatchEntry } from '../../src/api/footywire';
import { TeamBadge } from '../../src/components/TeamBadge';
import { PlayerScoreChart } from '../../src/components/PlayerScoreChart';

// 2024 / 2025 ran 24 home-and-away rounds. We don't bother with finals
// since SuperCoach pricing only counts the regular season anyway.
const SEASON_YEARS = [2026, 2025, 2024];
const HISTORICAL_LAST_ROUND = 24;

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const maxRound = useAppStore(s => s.maxRound);
  const selectedYear = useAppStore(s => s.selectedYear);
  const setSelectedYear = useAppStore(s => s.setSelectedYear);
  const isHistorical = selectedYear !== CURRENT_YEAR;

  // For historical seasons we use the end-of-regular-season round (24).
  // For the current year we use the live maxRound.
  const viewRound = isHistorical ? HISTORICAL_LAST_ROUND : maxRound;

  const { data: players, isLoading } = usePlayers(selectedYear, viewRound);
  const { data: byeMap } = useByeRounds(selectedYear);
  const { data: fwMap } = useFootywireBreakevens();
  const { data: roundScoresById } = useRoundScores(selectedYear, viewRound, players ?? []);
  const { data: matchList } = useMatchList(selectedYear);
  const [activeTab, setActiveTab] = useState<'history' | 'fixtures'>('history');
  const [yearModalOpen, setYearModalOpen] = useState(false);

  const player = players?.find(p => String(p.id) === id);
  const stats = player?.player_stats?.[0];
  const playerId = player ? player.id : 0;
  const roundScores = roundScoresById[playerId];

  // For the current year, the "last completed" round is one behind maxRound
  // (which points at the live/upcoming round). For a closed historical
  // season, every round is locked, so we use the end-of-season round.
  const lastCompletedRound = isHistorical ? HISTORICAL_LAST_ROUND : Math.max(1, maxRound - 1);
  const lastRoundScore = (roundScores?.lastScore ?? 0) > 0 ? String(roundScores!.lastScore) : 'N/A';

  // Hoist fwPlayer + ppts before hooks so they can be passed as arguments.
  // In historical mode we don't use Footywire's currentBE (no live BE
  // tracking for closed seasons) — pass 0 to skip the BE-derivation cache.
  const fwPlayerEarly = fwMap ? footywireApi.lookupPlayer(fwMap, player?.first_name ?? '', player?.last_name ?? '') : undefined;
  const pptsEarly = isHistorical ? 0 : (fwPlayerEarly?.breakeven ?? stats?.ppts ?? 0);

  // Compute nextMatch + all fixtures before early returns so hooks are unconditional.
  // In historical mode none of these fire (no upcoming match for a finished season),
  // but we still call the hooks so the hook order stays stable.
  const nextMatch = !isHistorical ? matchList
    ?.filter(m => (m.homeTeam === player?.team?.name || m.awayTeam === player?.team?.name) && m.homeScore === null)
    .sort((a, b) => a.round - b.round)[0] : undefined;
  const { data: matchupStats } = useMatchupStats(player, nextMatch);
  const { data: roundBEs } = usePlayerRoundBEs(player, selectedYear, pptsEarly);

  const allFixtures = !isHistorical ? (matchList
    ?.filter(m => (m.homeTeam === player?.team?.name || m.awayTeam === player?.team?.name) && m.homeScore === null)
    .sort((a, b) => a.round - b.round) ?? []) : [];
  const { data: fixtureProjections = {} } = useFixtureProjections(
    player,
    allFixtures,
    player?.player_stats?.[0]?.avg3 ?? 0,
    player?.player_stats?.[0]?.avg ?? 0,
  );

  // Historical-mode summary derived from the player's profile page (the
  // only Footywire endpoint that respects year filtering). When viewing
  // 2025/2024 we override avg / 3rd / 5rd / price / weekly + season
  // change with these values; the listing-page snapshot in `stats` is
  // always current-year regardless of the URL year param.
  const { data: histSummary } = usePlayerHistoricalStats(player, selectedYear);
  const histPlayed = isHistorical && (histSummary?.games ?? 0) > 0;
  // True when we're in historical mode and have decisively confirmed
  // the player did not play that year — suppresses every stat below.
  const histNoData = isHistorical && histSummary !== undefined && (histSummary?.games ?? 0) === 0;


  if (isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (!player || !stats) {
    // In historical mode this most often means the player wasn't on an
    // AFL list that year (rookie debuting in 2026, or someone retired
    // before our viewYear). Surface that explicitly so the user sees
    // why their stats are blank rather than a generic "not found".
    if (isHistorical) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Stack.Screen options={{
            title: '',
            headerRight: () => (
              <YearPickerButton year={selectedYear} onPress={() => setYearModalOpen(true)} />
            ),
          }} />
          <View style={styles.notInSeason}>
            <Text style={styles.notInSeasonText}>
              Player was not part of the AFL in the {selectedYear} season
            </Text>
          </View>
          <YearPickerModal
            open={yearModalOpen}
            onClose={() => setYearModalOpen(false)}
            selectedYear={selectedYear}
            onSelect={(y) => { setSelectedYear(y); setYearModalOpen(false); }}
          />
        </ScrollView>
      );
    }
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
      <Stack.Screen options={{
        title: `${player.first_name} ${player.last_name}`,
        headerRight: () => (
          <YearPickerButton year={selectedYear} onPress={() => setYearModalOpen(true)} />
        ),
      }} />
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

      {/* Key stats row. In historical mode every value is sourced from
          the per-player profile-page summary (the only year-aware
          Footywire endpoint). When that summary reports 0 games we know
          the player did not play that year — render N/A across the
          board rather than letting current-season stats leak through. */}
      <View style={styles.statsGrid}>
        <StatBox
          label={`Rnd ${isHistorical ? (histSummary?.lastRound ?? lastCompletedRound) : lastCompletedRound}`}
          value={
            isHistorical
              ? (histPlayed ? String(histSummary!.lastScore) : 'N/A')
              : lastRoundScore
          }
          large
        />
        <StatBox
          label="Season Avg"
          value={
            isHistorical
              ? (histPlayed ? histSummary!.avg.toFixed(1) : 'N/A')
              : (avg > 0 ? avg.toFixed(1) : 'N/A')
          }
          large
        />
        <StatBox
          label="3 Rd Avg"
          value={
            isHistorical
              ? (histPlayed && histSummary!.avg3 > 0 ? histSummary!.avg3.toFixed(1) : 'N/A')
              : (avg3 > 0 ? avg3.toFixed(1) : 'N/A')
          }
          large
        />
        <StatBox
          label="5 Rd Avg"
          value={
            isHistorical
              ? (histPlayed && histSummary!.avg5 > 0 ? histSummary!.avg5.toFixed(1) : 'N/A')
              : (avg5 > 0 ? avg5.toFixed(1) : 'N/A')
          }
          large
        />
      </View>

      {/* Price row: in historical mode the values come from histSummary;
          if the player didn't play that year, all three render N/A. */}
      <View style={styles.priceRow}>
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Price</Text>
          <Text style={styles.priceValue}>
            {histNoData
              ? 'N/A'
              : formatPrice(isHistorical ? (histSummary?.lastPrice ?? 0) : (stats.price ?? 0))}
          </Text>
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Weekly Change</Text>
          {(() => {
            const change  = isHistorical ? (histSummary?.weeklyChange ?? 0) : weeklyPriceChange;
            const dir     = getPriceDirection(change);
            const display = histNoData ? 'N/A' : (change !== 0 ? formatPriceChange(change) : '-');
            return (
              <Text style={[
                styles.priceValue,
                dir === 'up' ? styles.up : dir === 'down' ? styles.down : styles.neutral,
              ]}>
                {display}
              </Text>
            );
          })()}
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Season Change</Text>
          {(() => {
            const change  = isHistorical ? (histSummary?.totalChange ?? 0) : totalPriceChange;
            const dir     = getPriceDirection(change);
            const display = histNoData ? 'N/A' : (change !== 0 ? formatPriceChange(change) : '-');
            return (
              <Text style={[
                styles.priceValue,
                dir === 'up' ? styles.up : dir === 'down' ? styles.down : styles.neutral,
              ]}>
                {display}
              </Text>
            );
          })()}
        </View>
      </View>

      {/* Breakeven section — only relevant for the live current season.
          Closed seasons don't have a "next round" to break even against. */}
      {!isHistorical && ppts !== 0 ? (
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

      {/* Matchup — only relevant for an active season with upcoming games. */}
      {!isHistorical ? (
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
      ) : null}

      {/* Bye info — also live-season only. */}
      {!isHistorical && futureByeRounds.length > 0 ? (
        <View style={styles.byeBox}>
          <Text style={styles.byeText}>
            {futureByeRounds.length === 1
              ? `Bye: Round ${futureByeRounds[0]}`
              : `Byes: ${futureByeRounds.map(r => `Round ${r}`).join(' & ')}`}
          </Text>
        </View>
      ) : null}

      {/* History / Fixtures — Fixtures tab is hidden in historical mode
          (no upcoming games for a closed season). */}
      <View style={styles.section}>
        {!isHistorical ? (
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
        ) : null}

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
            ) : history.map((m, idx) => {
              const isHome = m.homeTeam === player.team.name;
              const oppAbbrev = isHome ? m.awayAbbrev : m.homeAbbrev;
              const oppTeamName = isHome ? m.awayTeam : m.homeTeam;
              const myScore  = isHome ? m.homeScore! : m.awayScore!;
              const oppScore = isHome ? m.awayScore! : m.homeScore!;
              const result   = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D';
              const sc       = perRoundScores[m.round] ?? 0;
              return (
                // Compound key: in 2025 a team can have two matches sharing
                // a round number (regular round 24 + first finals week
                // sometimes labelled the same), so plain m.round collides.
                <View key={`${m.round}-${m.homeTeam}-${m.awayTeam}-${idx}`} style={hfStyles.row}>
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
            ) : fixtures.map((m, idx) => {
              const isHome    = m.homeTeam === player.team.name;
              const oppAbbrev = isHome ? m.awayAbbrev : m.homeAbbrev;
              const oppTeamName = isHome ? m.awayTeam : m.homeTeam;
              const proj      = projectedPrices[m.round];
              const projColor = !proj ? COLORS.textMuted
                : proj.delta > 0 ? COLORS.success
                : proj.delta < 0 ? COLORS.danger
                : COLORS.textMuted;
              return (
                <View key={`${m.round}-${m.homeTeam}-${m.awayTeam}-${idx}`} style={hfStyles.row}>
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

      {/* Score chart — only render once there are played rounds. In
          historical mode we drop the BE series (no live BE for closed
          seasons) so the chart renders only Round Score + Avg. The
          chart section uses tighter horizontal padding than other
          sections so a 24-round chart can keep the bars at a usable
          width on a 390pt phone (iPhone 13). */}
      {Object.keys(perRoundScores).some(r => perRoundScores[Number(r)] > 0) ? (
        <View style={[styles.section, styles.chartSection]}>
          <Text style={styles.sectionTitle}>Score History</Text>
          <PlayerScoreChart
            perRoundScores={perRoundScores}
            perRoundBE={isHistorical ? undefined : roundBEs}
            avg={avg}
            ppts={isHistorical ? 0 : ppts}
          />
        </View>
      ) : null}

      {/* Previous season — only show when data is available, and skip
          entirely in historical mode (the page is already historical). */}
      {!isHistorical && (player.previous_games ?? 0) > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Previous Season</Text>
          <View style={styles.prevSeason}>
            <StatBox label="Games" value={String(player.previous_games)} />
            <StatBox label="Average" value={(player.previous_average ?? 0).toFixed(1)} highlight />
            <StatBox label="Total" value={String(player.previous_total)} />
          </View>
        </View>
      ) : null}

      <YearPickerModal
        open={yearModalOpen}
        onClose={() => setYearModalOpen(false)}
        selectedYear={selectedYear}
        onSelect={(y) => { setSelectedYear(y); setYearModalOpen(false); }}
      />
    </ScrollView>
  );
}

/**
 * Compact year-picker control rendered in the screen header — plain text,
 * no surrounding pill (matches the unstyled look of other header elements).
 */
function YearPickerButton({ year, onPress }: { year: number; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.yearPickerBtn}>
      <Text style={styles.yearPickerText}>{year} ▾</Text>
    </TouchableOpacity>
  );
}

/**
 * Bottom-sheet modal for picking the season to view. Lists every entry in
 * SEASON_YEARS; the active year shows a check mark. Tapping a row commits
 * via the parent's onSelect (which writes to the Zustand store) and the
 * profile screen re-fetches against the new year.
 */
function YearPickerModal({
  open, onClose, selectedYear, onSelect,
}: {
  open: boolean;
  onClose: () => void;
  selectedYear: number;
  onSelect: (year: number) => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Season</Text>
          {SEASON_YEARS.map(year => {
            const active = year === selectedYear;
            return (
              <TouchableOpacity
                key={year}
                style={[styles.modalItem, active && styles.modalItemActive]}
                onPress={() => onSelect(year)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalItemText, active && styles.modalItemTextActive]}>{year}</Text>
                {active && <Text style={styles.modalCheck}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
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
  // Chart override: tighter horizontal padding (8 instead of 14) so a
  // 24-round chart on a 390pt phone gets ~12 more px of bar real estate.
  chartSection: { paddingHorizontal: 8 },
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

  // Year-picker modal — same shape as the Players-tab modal so the two
  // pickers feel like the same control.
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 220,
    maxHeight: 420,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  modalItemActive: { backgroundColor: COLORS.primary + '18' },
  modalItemText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  modalItemTextActive: { color: COLORS.primary },
  modalCheck: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },

  // Year picker — bare text in the header (no pill / background / border).
  // Slightly larger font and a visible chevron gap so the touch target
  // feels comfortable without needing extra chrome.
  yearPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 12,
  },
  yearPickerText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.3,
  },

  // "Player not in AFL that season" banner — shown when the player has
  // no row in the historical year's data.
  notInSeason: {
    marginTop: 32,
    padding: 24,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    alignItems: 'center',
  },
  notInSeasonText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
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
