import * as SQLite from 'expo-sqlite';

const DB_NAME = 'supercoachnuffies.db';
const SCHEMA_VERSION = 1;

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
  // short prefix ("be:", "rs:", "fx:", "mu:") so the same table can hold
  // unrelated caches and we can wipe a whole namespace without affecting
  // others. updated_at lets the freshness check live in SQL rather than
  // baked into each JSON payload.
  await db.execAsync(`
    pragma journal_mode = WAL;
    create table if not exists kv_blob (
      key        text    primary key,
      value      text    not null,
      updated_at integer not null
    );
    create index if not exists idx_kv_blob_updated on kv_blob(updated_at);

    create table if not exists schema_meta (
      id      integer primary key check (id = 1),
      version integer not null
    );
  `);

  // Future schema bumps can compare current to SCHEMA_VERSION and run
  // additive migrations. For now we only use it to record the version.
  await db.runAsync(
    `insert into schema_meta (id, version) values (1, ?)
     on conflict(id) do update set version = excluded.version`,
    [SCHEMA_VERSION],
  );

  return db;
}
