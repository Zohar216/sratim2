import { getDb } from './db';

export type Role = 'user' | 'assistant' | 'system';

export type StoredMessage = {
  id: number;
  conversationId: number;
  role: Role;
  text: string;
  meta: MessageMeta | null;
  createdAt: number;
};

/** Extra info shown under a message (never contains screen content). */
export type MessageMeta = {
  steps?: { label: string; ok: boolean; message?: string }[];
  latencyMs?: number;
  tokensPerSecond?: number;
  source?: 'router' | 'llm';
  error?: boolean;
};

export type Conversation = { id: number; title: string; createdAt: number; updatedAt: number; preview?: string };

// ---- Conversations ------------------------------------------------------------------------------

export async function createConversation(title: string): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  const res = await db.runAsync('INSERT INTO conversations (title, created_at, updated_at) VALUES (?, ?, ?)', title, now, now);
  return res.lastInsertRowId;
}

export async function listConversations(): Promise<Conversation[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; title: string; created_at: number; updated_at: number; preview: string | null }>(
    `SELECT c.id, c.title, c.created_at, c.updated_at,
            (SELECT text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS preview
       FROM conversations c ORDER BY c.updated_at DESC`,
  );
  return rows.map((r) => ({ id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at, preview: r.preview ?? undefined }));
}

export async function deleteConversation(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM messages WHERE conversation_id = ?', id);
  await db.runAsync('DELETE FROM conversations WHERE id = ?', id);
}

export async function deleteAllHistory(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM messages; DELETE FROM conversations; DELETE FROM task_log;');
}

// ---- Messages -----------------------------------------------------------------------------------

export async function addMessage(conversationId: number, role: Role, text: string, meta?: MessageMeta): Promise<StoredMessage> {
  const db = await getDb();
  const now = Date.now();
  const res = await db.runAsync(
    'INSERT INTO messages (conversation_id, role, text, meta, created_at) VALUES (?, ?, ?, ?, ?)',
    conversationId,
    role,
    text,
    meta ? JSON.stringify(meta) : null,
    now,
  );
  await db.runAsync('UPDATE conversations SET updated_at = ? WHERE id = ?', now, conversationId);
  return { id: res.lastInsertRowId, conversationId, role, text, meta: meta ?? null, createdAt: now };
}

export async function getMessages(conversationId: number): Promise<StoredMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; conversation_id: number; role: Role; text: string; meta: string | null; created_at: number }>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC',
    conversationId,
  );
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    text: r.text,
    meta: r.meta ? (JSON.parse(r.meta) as MessageMeta) : null,
    createdAt: r.created_at,
  }));
}

// ---- Aliases ("אמא" → "רחל כהן" / phone number) --------------------------------------------------

export type Alias = { alias: string; value: string };

export async function setAlias(alias: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO aliases (alias, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(alias) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    alias.trim(),
    value.trim(),
    Date.now(),
  );
}

export async function getAlias(alias: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM aliases WHERE alias = ?', alias.trim());
  return row?.value ?? null;
}

export async function listAliases(): Promise<Alias[]> {
  const db = await getDb();
  return db.getAllAsync<Alias>('SELECT alias, value FROM aliases ORDER BY alias');
}

export async function deleteAlias(alias: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM aliases WHERE alias = ?', alias);
}

// ---- Settings (key/value JSON) --------------------------------------------------------------------

export async function loadSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function saveSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}

// ---- Task log (action names + outcome only — no screen content) ------------------------------------

export async function logTask(request: string, actions: string[], outcome: string, durationMs: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO task_log (created_at, request, actions, outcome, duration_ms) VALUES (?, ?, ?, ?, ?)',
    Date.now(),
    request.slice(0, 500),
    JSON.stringify(actions),
    outcome.slice(0, 500),
    durationMs,
  );
}

export type TaskLogEntry = { id: number; createdAt: number; request: string; actions: string[]; outcome: string; durationMs: number };

export async function recentTasks(limit = 50): Promise<TaskLogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; created_at: number; request: string; actions: string; outcome: string; duration_ms: number }>(
    'SELECT * FROM task_log ORDER BY id DESC LIMIT ?',
    limit,
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    request: r.request,
    actions: JSON.parse(r.actions) as string[],
    outcome: r.outcome,
    durationMs: r.duration_ms,
  }));
}
