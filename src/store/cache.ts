import { getDb } from './db';

/**
 * Generic JSON-blob cache backed by SQLite. Each entry is keyed by a string
 * (use a namespace prefix like "be:" / "rs:" / "fx:" / "mu:" so different
 * caches don't collide) and stores arbitrary JSON.
 *
 * Compared to AsyncStorage, the win here is that lookups read a single row
 * instead of parsing the entire cache map — the BE cache especially used to
 * deserialise ~789 entries on every player lookup.
 */

export interface CacheEntry<T> {
  value: T;
  updatedAt: number; // epoch ms
}

/** Returns the value if present, regardless of age. Use the wrapper that
 *  also returns updatedAt if you need to enforce a TTL. */
export async function getJson<T>(key: string): Promise<T | null> {
  const entry = await getEntry<T>(key);
  return entry?.value ?? null;
}

export async function getEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string; updated_at: number }>(
    'select value, updated_at from kv_blob where key = ?',
    [key],
  );
  if (!row) return null;
  try {
    return { value: JSON.parse(row.value) as T, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

/**
 * Write a JSON payload. Pass `{ permanent: true }` for rows whose underlying
 * fact can't change after the round it covers ended (past-round BEs,
 * completed-round scores, prior-season matchup aggregates) — those rows skip
 * the TTL check on read. Default behaviour stays TTL-based for live data.
 */
export async function setJson<T>(
  key: string,
  value: T,
  opts?: { permanent?: boolean },
): Promise<void> {
  const db = await getDb();
  const permanent = opts?.permanent ? 1 : 0;
  await db.runAsync(
    `insert into kv_blob (key, value, updated_at, permanent) values (?, ?, ?, ?)
     on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at, permanent = excluded.permanent`,
    [key, JSON.stringify(value), Date.now(), permanent],
  );
}

export async function deleteJson(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from kv_blob where key = ?', [key]);
}

/** Returns true if a row exists and is either permanent or younger than maxAgeMs. */
export async function isFresh(key: string, maxAgeMs: number): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ updated_at: number; permanent: number }>(
    'select updated_at, permanent from kv_blob where key = ?',
    [key],
  );
  if (!row) return false;
  if (row.permanent) return true;
  return Date.now() - row.updated_at < maxAgeMs;
}

/** Returns true if the row exists and is marked permanent (TTL-exempt). */
export async function isPermanent(key: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ permanent: number }>(
    'select permanent from kv_blob where key = ?',
    [key],
  );
  return !!row?.permanent;
}

/** Bulk-delete every key with a given prefix (e.g. "be:" wipes all
 *  breakeven cache entries). Useful for invalidating a whole namespace. */
export async function deleteByPrefix(prefix: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from kv_blob where key like ?', [`${prefix}%`]);
}
