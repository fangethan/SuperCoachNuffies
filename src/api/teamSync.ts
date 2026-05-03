import { supabase } from './supabase';

export interface TeamSnapshot {
  myTeamIds: number[];
  myBenchIds: number[];
  myTeamScPositions: Record<number, string>;
  myTeamEmgIds: number[];
  captainId: number | null;
  vcId: number | null;
}

const TABLE = 'user_teams';

/** Upsert the current user's team into Supabase. No-op if not signed in. */
export async function pushTeam(snapshot: TeamSnapshot): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { user_id: user.id, team_data: snapshot, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) {
    console.warn('[teamSync] pushTeam failed:', error.message);
    throw error;
  }
}

/** Returns the cloud snapshot for the current user, or null if none / signed out. */
export async function pullTeam(): Promise<TeamSnapshot | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select('team_data')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('[teamSync] pullTeam failed:', error.message);
    return null;
  }
  return (data?.team_data as TeamSnapshot) ?? null;
}
