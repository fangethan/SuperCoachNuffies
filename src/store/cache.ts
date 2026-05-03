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

export async function setJson<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `insert into kv_blob (key, value, updated_at) values (?, ?, ?)
     on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), Date.now()],
  );
}

export async function deleteJson(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from kv_blob where key = ?', [key]);
}

/** Returns true if a fresh entry exists (newer than maxAgeMs). */
export async function isFresh(key: string, maxAgeMs: number): Promise<boolean> {
  const entry = await getEntry<unknown>(key);
  return !!entry && Date.now() - entry.updatedAt < maxAgeMs;
}

/** Bulk-delete every key with a given prefix (e.g. "be:" wipes all
 *  breakeven cache entries). Useful for invalidating a whole namespace. */
export async function deleteByPrefix(prefix: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from kv_blob where key like ?', [`${prefix}%`]);
}
