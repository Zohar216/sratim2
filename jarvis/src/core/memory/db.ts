import * as SQLite from 'expo-sqlite';

/**
 * Local memory (SQLite, on-device only). Nothing here is ever sent anywhere.
 *
 * Privacy rules enforced by what we store:
 *  - no passwords/credentials (there is no table or field for them),
 *  - no screenshots and no raw screen content (task_log keeps action names + outcome only),
 *  - chat history can be wiped from Settings.
 */

let db: SQLite.SQLiteDatabase | null = null;

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS conversations (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
     role TEXT NOT NULL,
     text TEXT NOT NULL,
     meta TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
   CREATE TABLE IF NOT EXISTS aliases (
     alias TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS task_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     created_at INTEGER NOT NULL,
     request TEXT NOT NULL,
     actions TEXT NOT NULL,
     outcome TEXT NOT NULL,
     duration_ms INTEGER NOT NULL
   );`,
];

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  const instance = await SQLite.openDatabaseAsync('jarvis.db');
  await instance.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await instance.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await instance.execAsync(MIGRATIONS[v]);
    await instance.execAsync(`PRAGMA user_version = ${v + 1}`);
  }
  db = instance;
  return instance;
}
