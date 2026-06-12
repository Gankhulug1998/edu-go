import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CardData } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SEED_PATH = resolve(ROOT, 'public', 'drafts.json');

// DATABASE_URL жишээ: postgres://kanjimn:pass@127.0.0.1:15432/kanjimn
// Локал хөгжүүлэлтэд unix socket: postgres:///kanjimn?host=/var/run/postgresql
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres:///kanjimn?host=/var/run/postgresql',
  max: 10,
});

// ───────────────── SCHEMA ─────────────────
export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drafts (
      character  TEXT    PRIMARY KEY,
      position   INTEGER NOT NULL,
      data       JSONB   NOT NULL,
      is_done    BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at BIGINT  NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_position ON drafts(position);

    CREATE TABLE IF NOT EXISTS images (
      character   TEXT    NOT NULL REFERENCES drafts(character) ON DELETE CASCADE,
      slot        TEXT    NOT NULL CHECK(slot IN ('main','evolution','icon')),
      mime        TEXT    NOT NULL,
      data        BYTEA   NOT NULL,
      size        INTEGER NOT NULL,
      uploaded_at BIGINT  NOT NULL,
      PRIMARY KEY(character, slot)
    );

    CREATE TABLE IF NOT EXISTS renders (
      id          SERIAL  PRIMARY KEY,
      character   TEXT    NOT NULL REFERENCES drafts(character) ON DELETE CASCADE,
      format      TEXT    NOT NULL,
      data        BYTEA   NOT NULL,
      size        INTEGER NOT NULL,
      rendered_at BIGINT  NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_renders_char ON renders(character, rendered_at DESC);
  `);
}

// ───────────────── SEED ─────────────────
export async function seedIfEmpty(): Promise<{ seeded: number }> {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM drafts');
  if (rows[0].n > 0) return { seeded: 0 };
  return reseed();
}

export async function reseed(): Promise<{ seeded: number }> {
  const seed: CardData[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < seed.length; i++) {
      await client.query(
        `INSERT INTO drafts (character, position, data, is_done, updated_at)
         VALUES ($1, $2, $3, FALSE, $4)
         ON CONFLICT (character) DO UPDATE SET
           position   = EXCLUDED.position,
           data       = EXCLUDED.data,
           updated_at = EXCLUDED.updated_at`,
        [seed[i].character, i, JSON.stringify(seed[i]), nowMs()]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
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

const DRAFT_SELECT = `
  SELECT d.character, d.position, d.data, d.is_done, d.updated_at,
    EXISTS(SELECT 1 FROM images WHERE character = d.character AND slot = 'main')      AS has_main,
    EXISTS(SELECT 1 FROM images WHERE character = d.character AND slot = 'evolution') AS has_evolution,
    EXISTS(SELECT 1 FROM images WHERE character = d.character AND slot = 'icon')      AS has_icon
  FROM drafts d`;

export async function listDrafts(): Promise<DraftSummary[]> {
  const { rows } = await pool.query(`${DRAFT_SELECT} ORDER BY d.position`);
  return rows.map((r) => ({
    character: r.character,
    position: r.position,
    pinyin: (r.data as CardData).pinyin,
    meaning: (r.data as CardData).meaning,
    isDone: r.is_done,
    hasImages: { main: r.has_main, evolution: r.has_evolution, icon: r.has_icon },
    updatedAt: Number(r.updated_at),
  }));
}

export async function getDraft(character: string): Promise<DraftFull | null> {
  const { rows } = await pool.query(`${DRAFT_SELECT} WHERE d.character = $1`, [character]);
  const r = rows[0];
  if (!r) return null;
  return {
    character: r.character,
    position: r.position,
    isDone: r.is_done,
    data: r.data,
    hasImages: { main: r.has_main, evolution: r.has_evolution, icon: r.has_icon },
    updatedAt: Number(r.updated_at),
  };
}

/** Merge `partial` into existing draft data; persist. Returns merged draft. */
export async function updateDraft(character: string, partial: Partial<CardData>): Promise<DraftFull | null> {
  const current = await getDraft(character);
  if (!current) return null;
  const merged: CardData = deepMerge(current.data, partial);
  await pool.query(`UPDATE drafts SET data = $1, updated_at = $2 WHERE character = $3`, [
    JSON.stringify(merged), nowMs(), character,
  ]);
  return getDraft(character);
}

/** Revert one draft back to its seed values. Returns reset draft. */
export async function resetDraft(character: string): Promise<DraftFull | null> {
  const seed: CardData[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  const original = seed.find((c) => c.character === character);
  if (!original) return null;
  await pool.query(
    `UPDATE drafts SET data = $1, is_done = FALSE, updated_at = $2 WHERE character = $3`,
    [JSON.stringify(original), nowMs(), character]
  );
  await pool.query(`DELETE FROM images WHERE character = $1`, [character]);
  return getDraft(character);
}

export async function markDone(character: string): Promise<void> {
  await pool.query(`UPDATE drafts SET is_done = TRUE, updated_at = $1 WHERE character = $2`, [
    nowMs(), character,
  ]);
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

export async function setImage(
  character: string,
  slot: 'main' | 'evolution' | 'icon',
  mime: string,
  data: Buffer
): Promise<void> {
  await pool.query(
    `INSERT INTO images (character, slot, mime, data, size, uploaded_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (character, slot) DO UPDATE SET
       mime = EXCLUDED.mime,
       data = EXCLUDED.data,
       size = EXCLUDED.size,
       uploaded_at = EXCLUDED.uploaded_at`,
    [character, slot, mime, data, data.length, nowMs()]
  );
}

export async function getImage(character: string, slot: string): Promise<ImageRow | null> {
  const { rows } = await pool.query(
    `SELECT character, slot, mime, data, size, uploaded_at FROM images WHERE character = $1 AND slot = $2`,
    [character, slot]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    character: r.character,
    slot: r.slot,
    mime: r.mime,
    data: r.data,
    size: r.size,
    uploadedAt: Number(r.uploaded_at),
  };
}

export async function removeImage(character: string, slot: string): Promise<boolean> {
  const res = await pool.query(`DELETE FROM images WHERE character = $1 AND slot = $2`, [character, slot]);
  return (res.rowCount ?? 0) > 0;
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

export async function addRender(character: string, format: string, data: Buffer): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO renders (character, format, data, size, rendered_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [character, format, data, data.length, nowMs()]
  );
  return rows[0].id;
}

export async function getRender(id: number): Promise<RenderRow | null> {
  const { rows } = await pool.query(
    `SELECT id, character, format, data, size, rendered_at FROM renders WHERE id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, character: r.character, format: r.format, data: r.data, size: r.size, renderedAt: Number(r.rendered_at) };
}

export async function listRenders(character: string, limit = 10) {
  const { rows } = await pool.query(
    `SELECT id, format, size, rendered_at FROM renders
     WHERE character = $1 ORDER BY rendered_at DESC LIMIT $2`,
    [character, limit]
  );
  return rows.map((r) => ({ id: r.id, format: r.format, size: r.size, renderedAt: Number(r.rendered_at) }));
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

export { pool };
