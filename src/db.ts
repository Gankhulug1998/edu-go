import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CardData } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DB_PATH = process.env.KANJI_DB ?? resolve(ROOT, 'data', 'kanjimn.db');
const SEED_PATH = resolve(ROOT, 'public', 'drafts.json');

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ───────────────── SCHEMA ─────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS drafts (
    character  TEXT    PRIMARY KEY,
    position   INTEGER NOT NULL,
    data       TEXT    NOT NULL,
    is_done    INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_drafts_position ON drafts(position);

  CREATE TABLE IF NOT EXISTS images (
    character   TEXT    NOT NULL,
    slot        TEXT    NOT NULL CHECK(slot IN ('main','evolution','icon')),
    mime        TEXT    NOT NULL,
    data        BLOB    NOT NULL,
    size        INTEGER NOT NULL,
    uploaded_at INTEGER NOT NULL,
    PRIMARY KEY(character, slot),
    FOREIGN KEY(character) REFERENCES drafts(character) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS renders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    character   TEXT    NOT NULL,
    format      TEXT    NOT NULL,
    data        BLOB    NOT NULL,
    size        INTEGER NOT NULL,
    rendered_at INTEGER NOT NULL,
    FOREIGN KEY(character) REFERENCES drafts(character) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_renders_char ON renders(character, rendered_at DESC);
`);

// ───────────────── SEED ─────────────────
export function seedIfEmpty(): { seeded: number } {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM drafts').get() as { n: number }).n;
  if (count > 0) return { seeded: 0 };
  return reseed();
}

export function reseed(): { seeded: number } {
  const seed: CardData[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  const upsert = db.prepare(`
    INSERT INTO drafts (character, position, data, is_done, updated_at)
    VALUES (@character, @position, @data, 0, @updated_at)
    ON CONFLICT(character) DO UPDATE SET
      position   = excluded.position,
      data       = excluded.data,
      updated_at = excluded.updated_at
  `);
  const tx = db.transaction((items: CardData[]) => {
    items.forEach((card, i) => {
      upsert.run({
        character: card.character,
        position: i,
        data: JSON.stringify(card),
        updated_at: nowMs(),
      });
    });
  });
  tx(seed);
  return { seeded: seed.length };
}

// ───────────────── DRAFTS ─────────────────
export interface DraftSummary {
  character: string;
  position: number;
  pinyin: string;
  meaning: string;
  isDone: boolean;
  hasImages: { main: boolean; evolution: boolean; icon: boolean };
  updatedAt: number;
}

export interface DraftFull {
  character: string;
  position: number;
  isDone: boolean;
  data: CardData;
  hasImages: { main: boolean; evolution: boolean; icon: boolean };
  updatedAt: number;
}

const stmtListDrafts = db.prepare(`
  SELECT d.character, d.position, d.data, d.is_done, d.updated_at,
    EXISTS(SELECT 1 FROM images WHERE character = d.character AND slot = 'main')      AS has_main,
    EXISTS(SELECT 1 FROM images WHERE character = d.character AND slot = 'evolution') AS has_evolution,
    EXISTS(SELECT 1 FROM images WHERE character = d.character AND slot = 'icon')      AS has_icon
  FROM drafts d
  ORDER BY d.position
`);

export function listDrafts(): DraftSummary[] {
  const rows = stmtListDrafts.all() as any[];
  return rows.map((r) => {
    const card = JSON.parse(r.data) as CardData;
    return {
      character: r.character,
      position: r.position,
      pinyin: card.pinyin,
      meaning: card.meaning,
      isDone: !!r.is_done,
      hasImages: { main: !!r.has_main, evolution: !!r.has_evolution, icon: !!r.has_icon },
      updatedAt: r.updated_at,
    };
  });
}

const stmtGetDraft = db.prepare(`
  SELECT d.character, d.position, d.data, d.is_done, d.updated_at,
    EXISTS(SELECT 1 FROM images WHERE character = d.character AND slot = 'main')      AS has_main,
    EXISTS(SELECT 1 FROM images WHERE character = d.character AND slot = 'evolution') AS has_evolution,
    EXISTS(SELECT 1 FROM images WHERE character = d.character AND slot = 'icon')      AS has_icon
  FROM drafts d WHERE d.character = ?
`);

export function getDraft(character: string): DraftFull | null {
  const r = stmtGetDraft.get(character) as any;
  if (!r) return null;
  return {
    character: r.character,
    position: r.position,
    isDone: !!r.is_done,
    data: JSON.parse(r.data),
    hasImages: { main: !!r.has_main, evolution: !!r.has_evolution, icon: !!r.has_icon },
    updatedAt: r.updated_at,
  };
}

const stmtUpdateDraft = db.prepare(
  `UPDATE drafts SET data = ?, updated_at = ? WHERE character = ?`
);

/** Merge `partial` into existing draft data; persist. Returns merged draft. */
export function updateDraft(character: string, partial: Partial<CardData>): DraftFull | null {
  const current = getDraft(character);
  if (!current) return null;
  const merged: CardData = deepMerge(current.data, partial);
  stmtUpdateDraft.run(JSON.stringify(merged), nowMs(), character);
  return getDraft(character);
}

const stmtResetDraft = db.prepare(`UPDATE drafts SET data = ?, is_done = 0, updated_at = ? WHERE character = ?`);

/** Revert one draft back to its seed values. Returns reset draft. */
export function resetDraft(character: string): DraftFull | null {
  const seed: CardData[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  const original = seed.find((c) => c.character === character);
  if (!original) return null;
  stmtResetDraft.run(JSON.stringify(original), nowMs(), character);
  // Also delete any uploaded images for that character.
  db.prepare(`DELETE FROM images WHERE character = ?`).run(character);
  return getDraft(character);
}

const stmtMarkDone = db.prepare(`UPDATE drafts SET is_done = 1, updated_at = ? WHERE character = ?`);
export function markDone(character: string): void {
  stmtMarkDone.run(nowMs(), character);
}

// ───────────────── IMAGES ─────────────────
export interface ImageRow {
  character: string;
  slot: 'main' | 'evolution' | 'icon';
  mime: string;
  data: Buffer;
  size: number;
  uploadedAt: number;
}

const stmtSetImage = db.prepare(`
  INSERT INTO images (character, slot, mime, data, size, uploaded_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(character, slot) DO UPDATE SET
    mime = excluded.mime,
    data = excluded.data,
    size = excluded.size,
    uploaded_at = excluded.uploaded_at
`);

export function setImage(
  character: string,
  slot: 'main' | 'evolution' | 'icon',
  mime: string,
  data: Buffer
): void {
  stmtSetImage.run(character, slot, mime, data, data.length, nowMs());
}

const stmtGetImage = db.prepare(
  `SELECT character, slot, mime, data, size, uploaded_at FROM images WHERE character = ? AND slot = ?`
);

export function getImage(character: string, slot: string): ImageRow | null {
  const r = stmtGetImage.get(character, slot) as any;
  if (!r) return null;
  return {
    character: r.character,
    slot: r.slot,
    mime: r.mime,
    data: r.data,
    size: r.size,
    uploadedAt: r.uploaded_at,
  };
}

const stmtRemoveImage = db.prepare(`DELETE FROM images WHERE character = ? AND slot = ?`);
export function removeImage(character: string, slot: string): boolean {
  return stmtRemoveImage.run(character, slot).changes > 0;
}

// ───────────────── RENDERS ─────────────────
export interface RenderRow {
  id: number;
  character: string;
  format: string;
  data: Buffer;
  size: number;
  renderedAt: number;
}

const stmtAddRender = db.prepare(`
  INSERT INTO renders (character, format, data, size, rendered_at)
  VALUES (?, ?, ?, ?, ?)
`);
export function addRender(character: string, format: string, data: Buffer): number {
  const r = stmtAddRender.run(character, format, data, data.length, nowMs());
  return Number(r.lastInsertRowid);
}

const stmtGetRender = db.prepare(`SELECT id, character, format, data, size, rendered_at FROM renders WHERE id = ?`);
export function getRender(id: number): RenderRow | null {
  const r = stmtGetRender.get(id) as any;
  if (!r) return null;
  return { id: r.id, character: r.character, format: r.format, data: r.data, size: r.size, renderedAt: r.rendered_at };
}

const stmtListRenders = db.prepare(`
  SELECT id, format, size, rendered_at
  FROM renders WHERE character = ?
  ORDER BY rendered_at DESC
  LIMIT ?
`);
export function listRenders(character: string, limit = 10) {
  return (stmtListRenders.all(character, limit) as any[]).map((r) => ({
    id: r.id, format: r.format, size: r.size, renderedAt: r.rendered_at,
  }));
}

// ───────────────── HELPERS ─────────────────
function nowMs(): number { return Date.now(); }

function isPlainObject(v: any): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge<T>(base: T, patch: any): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch ?? base;
  const out: any = { ...base };
  for (const k of Object.keys(patch)) {
    out[k] = deepMerge((base as any)[k], (patch as any)[k]);
  }
  return out;
}

export { db };
