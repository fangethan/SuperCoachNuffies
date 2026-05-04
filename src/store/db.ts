import * as SQLite from 'expo-sqlite';

const DB_NAME = 'supercoachnuffies.db';
const SCHEMA_VERSION = 2;

// Lazy singleton — opened on first use, reused thereafter. The handle itself
// is async so that the JS bundle can import this file without forcing the
// database open at module-load time.
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) _dbPromise = openAndMigrate();
  return _dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);

  // Single generic KV-blob table backs every cache. Keys are namespaced by a
  // short prefix ("be7:", "be7p:", "rs:", "fx:", "mu:") so the same table
  // can hold unrelated caches and we can wipe a whole namespace without
  // touching others. updated_at lets the TTL check live in SQL.
  //
  // permanent = 1 means "skip the TTL check, this row is locked." Used for
  // immutable data (past-round BEs, completed-round scores, prior-season
  // matchup aggregates). Default 0 keeps existing call sites at TTL.
  await db.execAsync(`
    pragma journal_mode = WAL;
    create table if not exists kv_blob (
      key        text    primary key,
      value      text    not null,
      updated_at integer not null,
      permanent  integer not null default 0
    );
    create index if not exists idx_kv_blob_updated on kv_blob(updated_at);

    create table if not exists schema_meta (
      id      integer primary key check (id = 1),
      version integer not null
    );
  `);

  // v1 → v2: existing installs created kv_blob without the permanent
  // column. Add it. Fresh installs already have it via the create table
  // above, so the alter throws "duplicate column" and we swallow it.
  const versionRow = await db.getFirstAsync<{ version: number }>(
    'select version from schema_meta where id = 1',
  );
  const currentVersion = versionRow?.version ?? 0;
  if (currentVersion < 2) {
    try {
      await db.execAsync(
        'alter table kv_blob add column permanent integer not null default 0',
      );
    } catch {
      // Column already exists (fresh install path) — ignore.
    }
  }

  await db.runAsync(
    `insert into schema_meta (id, version) values (1, ?)
     on conflict(id) do update set version = excluded.version`,
    [SCHEMA_VERSION],
  );

  return db;
}
