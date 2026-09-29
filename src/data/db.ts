// SQLite persistence: decks, cards, the review log and settings.
import * as SQLite from 'expo-sqlite';

import { newSrsState } from '@/core/sm2';
import type { ReviewRow } from '@/core/stats';
import {
  DEFAULT_DECK_ID,
  DEFAULT_SETTINGS,
  type Card,
  type Deck,
  type GradeSignal,
  type Quality,
  type Settings,
  type SrsState,
} from '@/core/types';

// Each entry upgrades the schema by one version (PRAGMA user_version).
const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created INTEGER NOT NULL,
    ef REAL NOT NULL,
    reps INTEGER NOT NULL,
    interval INTEGER NOT NULL,
    due INTEGER NOT NULL,
    lapses INTEGER NOT NULL,
    last_review INTEGER,
    last_quality INTEGER
  );
  CREATE INDEX IF NOT EXISTS cards_due ON cards(due);
  CREATE TABLE IF NOT EXISTS review_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    quality INTEGER NOT NULL,
    reaction_ms INTEGER,
    signal TEXT NOT NULL,
    same_day_repeat INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  `,
  `
  CREATE TABLE decks (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, created INTEGER NOT NULL);
  INSERT INTO decks (id, name, created) VALUES ('${DEFAULT_DECK_ID}', 'General', 0);
  ALTER TABLE cards ADD COLUMN deck_id TEXT NOT NULL DEFAULT '${DEFAULT_DECK_ID}';
  CREATE INDEX cards_deck ON cards(deck_id);
  CREATE INDEX review_log_ts ON review_log(ts);
  `,
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync('ankivoice.db');
    await d.execAsync('PRAGMA journal_mode = WAL;');
    const row = await d.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
      await d.withTransactionAsync(async () => {
        await d.execAsync(MIGRATIONS[v]);
        await d.execAsync(`PRAGMA user_version = ${v + 1}`);
      });
    }
    return d;
  })().catch((err) => {
    dbPromise = null; // allow a retry on the next call
    throw err;
  });
  return dbPromise;
}

// ---- change notifications, so screens refresh after edits elsewhere ----
const listeners = new Set<() => void>();
export function onDataChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function changed() {
  listeners.forEach((fn) => fn());
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---- decks ----

export interface DeckWithCounts extends Deck {
  total: number;
  due: number;
  fresh: number;
}

export async function listDecks(): Promise<Deck[]> {
  return (await db()).getAllAsync<Deck>('SELECT id, name, created FROM decks ORDER BY created, name');
}

export async function listDecksWithCounts(now: number): Promise<DeckWithCounts[]> {
  return (await db()).getAllAsync<DeckWithCounts>(
    `SELECT d.id, d.name, d.created,
            COUNT(c.id) AS total,
            COALESCE(SUM(CASE WHEN c.last_review IS NOT NULL AND c.due <= ? THEN 1 ELSE 0 END), 0) AS due,
            COALESCE(SUM(CASE WHEN c.id IS NOT NULL AND c.last_review IS NULL THEN 1 ELSE 0 END), 0) AS fresh
     FROM decks d LEFT JOIN cards c ON c.deck_id = d.id
     GROUP BY d.id ORDER BY d.created, d.name`,
    now,
  );
}

export async function createDeck(name: string): Promise<Deck> {
  const deck = { id: newId(), name: name.trim(), created: Date.now() };
  await (await db()).runAsync('INSERT INTO decks (id, name, created) VALUES (?, ?, ?)', deck.id, deck.name, deck.created);
  changed();
  return deck;
}

export async function renameDeck(id: string, name: string): Promise<void> {
  await (await db()).runAsync('UPDATE decks SET name = ? WHERE id = ?', name.trim(), id);
  changed();
}

/** Deletes a deck; its cards move to the default deck (which can't be deleted). */
export async function deleteDeck(id: string): Promise<void> {
  if (id === DEFAULT_DECK_ID) return;
  const d = await db();
  await d.withTransactionAsync(async () => {
    await d.runAsync('UPDATE cards SET deck_id = ? WHERE deck_id = ?', DEFAULT_DECK_ID, id);
    await d.runAsync('DELETE FROM decks WHERE id = ?', id);
  });
  changed();
}

// ---- cards ----

interface CardRow {
  id: string;
  deck_id: string;
  question: string;
  answer: string;
  created: number;
  ef: number;
  reps: number;
  interval: number;
  due: number;
  lapses: number;
  last_review: number | null;
  last_quality: number | null;
}

const toCard = (r: CardRow): Card => ({
  id: r.id,
  deckId: r.deck_id,
  question: r.question,
  answer: r.answer,
  created: r.created,
  ef: r.ef,
  reps: r.reps,
  interval: r.interval,
  due: r.due,
  lapses: r.lapses,
  lastReview: r.last_review,
  lastQuality: r.last_quality as Quality | null,
});

/** All cards, or only those in `deckId`. Newest first. */
export async function listCards(deckId?: string | null): Promise<Card[]> {
  const d = await db();
  const rows = deckId
    ? await d.getAllAsync<CardRow>('SELECT * FROM cards WHERE deck_id = ? ORDER BY created DESC', deckId)
    : await d.getAllAsync<CardRow>('SELECT * FROM cards ORDER BY created DESC');
  return rows.map(toCard);
}

export async function getCard(id: string): Promise<Card | null> {
  const row = await (await db()).getFirstAsync<CardRow>('SELECT * FROM cards WHERE id = ?', id);
  return row ? toCard(row) : null;
}

export async function addCards(pairs: { question: string; answer: string }[], deckId: string = DEFAULT_DECK_ID): Promise<number> {
  const d = await db();
  const now = Date.now();
  await d.withTransactionAsync(async () => {
    for (const [i, { question, answer }] of pairs.entries()) {
      const s = newSrsState(now);
      await d.runAsync(
        'INSERT INTO cards (id, deck_id, question, answer, created, ef, reps, interval, due, lapses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        newId(),
        deckId,
        question.trim(),
        answer.trim(),
        now + i, // keep import order stable
        s.ef,
        s.reps,
        s.interval,
        s.due,
        s.lapses,
      );
    }
  });
  changed();
  return pairs.length;
}

export async function updateCard(id: string, fields: { question: string; answer: string; deckId: string }): Promise<void> {
  await (await db()).runAsync(
    'UPDATE cards SET question = ?, answer = ?, deck_id = ? WHERE id = ?',
    fields.question.trim(),
    fields.answer.trim(),
    fields.deckId,
    id,
  );
  changed();
}

export async function deleteCard(id: string): Promise<void> {
  const d = await db();
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM cards WHERE id = ?', id);
    await d.runAsync('DELETE FROM review_log WHERE card_id = ?', id);
  });
  changed();
}

/** Forget all progress on a card; it becomes new again. */
export async function resetCard(id: string): Promise<void> {
  await saveSrsState(id, newSrsState(Date.now()), false);
  changed();
}

export async function saveSrsState(id: string, s: SrsState, notify = true): Promise<void> {
  await (await db()).runAsync(
    'UPDATE cards SET ef = ?, reps = ?, interval = ?, due = ?, lapses = ?, last_review = ?, last_quality = ? WHERE id = ?',
    s.ef,
    s.reps,
    s.interval,
    s.due,
    s.lapses,
    s.lastReview,
    s.lastQuality,
    id,
  );
  if (notify) changed();
}

// ---- review log ----

export async function logReview(entry: {
  cardId: string;
  ts: number;
  quality: Quality;
  reactionMs: number | null;
  signal: GradeSignal;
  sameDayRepeat: boolean;
}): Promise<number> {
  const r = await (await db()).runAsync(
    'INSERT INTO review_log (card_id, ts, quality, reaction_ms, signal, same_day_repeat) VALUES (?, ?, ?, ?, ?, ?)',
    entry.cardId,
    entry.ts,
    entry.quality,
    entry.reactionMs,
    entry.signal,
    entry.sameDayRepeat ? 1 : 0,
  );
  return r.lastInsertRowId;
}

export async function updateReviewQuality(logId: number, quality: Quality): Promise<void> {
  await (await db()).runAsync("UPDATE review_log SET quality = ?, signal = 'button' WHERE id = ?", quality, logId);
}

export async function listReviewsSince(since: number): Promise<ReviewRow[]> {
  const rows = await (await db()).getAllAsync<{ ts: number; quality: number; reaction_ms: number | null; same_day_repeat: number }>(
    'SELECT ts, quality, reaction_ms, same_day_repeat FROM review_log WHERE ts >= ? ORDER BY ts',
    since,
  );
  return rows.map((r) => ({ ts: r.ts, quality: r.quality as Quality, reactionMs: r.reaction_ms, sameDayRepeat: r.same_day_repeat === 1 }));
}

// ---- settings ----

/** Returns null when nothing has been saved yet (first launch). */
export async function loadSettings(): Promise<Settings | null> {
  const row = await (await db()).getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'settings'");
  if (!row) return null;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
  } catch {
    return null;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await (await db()).runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('settings', ?)", JSON.stringify(s));
}

export async function exportJson(): Promise<string> {
  const d = await db();
  const decks = await d.getAllAsync('SELECT * FROM decks');
  const cards = await d.getAllAsync('SELECT * FROM cards');
  const reviews = await d.getAllAsync('SELECT * FROM review_log');
  return JSON.stringify({ version: 2, exported: new Date().toISOString(), decks, cards, reviews }, null, 2);
}
