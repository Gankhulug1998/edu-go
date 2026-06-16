import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CardData, CardLevel, CardCategory } from './types.js';
import { putObject, getObject, deleteObject, imageKey, storageEnabled, isNotFoundError } from './storage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SEED_PATH = resolve(ROOT, 'public', 'drafts.json');

// DATABASE_URL жишээ: postgres://edugo:pass@127.0.0.1:15432/edugo
// Локал хөгжүүлэлтэд unix socket: postgres:///edugo?host=/var/run/postgresql
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres:///edugo?host=/var/run/postgresql',
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
      object_key  TEXT    NOT NULL,
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

    -- ───────────────── LEARNER ACCOUNTS ─────────────────
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL  PRIMARY KEY,
      email         TEXT    UNIQUE NOT NULL,
      name          TEXT,
      password_hash TEXT,
      provider      TEXT    NOT NULL DEFAULT 'email',
      created_at    BIGINT  NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT    PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  BIGINT  NOT NULL,
      created_at  BIGINT  NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS progress (
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      character   TEXT    NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'studied',
      updated_at  BIGINT  NOT NULL,
      PRIMARY KEY (user_id, character)
    );

    -- Daily activity (streak / daily goal / XP)
    CREATE TABLE IF NOT EXISTS daily_activity (
      user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day      DATE    NOT NULL,
      reviews  INTEGER NOT NULL DEFAULT 0,
      xp       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
  `);

  // ── Spaced-repetition (SRS) state on progress (idempotent) ──
  await pool.query(`
    ALTER TABLE progress ADD COLUMN IF NOT EXISTS box        SMALLINT NOT NULL DEFAULT 0;
    ALTER TABLE progress ADD COLUMN IF NOT EXISTS due_at     BIGINT;
    ALTER TABLE progress ADD COLUMN IF NOT EXISTS streak     SMALLINT NOT NULL DEFAULT 0;
    ALTER TABLE progress ADD COLUMN IF NOT EXISTS lapses     SMALLINT NOT NULL DEFAULT 0;
    ALTER TABLE progress ADD COLUMN IF NOT EXISTS last_grade SMALLINT;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_progress_due ON progress(user_id, due_at);`);

  // ── Idempotent migration for DBs created before the MinIO switch ──
  // Add object_key if missing, and relax the old `data` NOT NULL so new
  // object_key-only rows insert even before the bytes are backfilled to MinIO.
  await pool.query(`ALTER TABLE images ADD COLUMN IF NOT EXISTS object_key TEXT;`);
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'images' AND column_name = 'data') THEN
        ALTER TABLE images ALTER COLUMN data DROP NOT NULL;
      END IF;
    END $$;
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
  /** Түвшин/ангилал — sidebar-г бүлэглэхэд (data доторх утга). */
  level?: CardLevel;
  category?: CardCategory;
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
  return rows.map((r) => {
    const data = r.data as CardData;
    return {
      character: r.character,
      position: r.position,
      pinyin: data.pinyin,
      meaning: data.meaning,
      isDone: r.is_done,
      hasImages: { main: r.has_main, evolution: r.has_evolution, icon: r.has_icon },
      updatedAt: Number(r.updated_at),
      level: data.level,
      category: data.category,
    };
  });
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
  const { rows } = await pool.query(`SELECT object_key FROM images WHERE character = $1`, [character]);
  await pool.query(`DELETE FROM images WHERE character = $1`, [character]);
  for (const r of rows) await tryDeleteObject(r.object_key); // MinIO объектуудыг цэвэрлэнэ
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
  const key = imageKey(character, slot);
  await putObject(key, data, mime); // байтуудыг MinIO-д хадгална
  await pool.query(
    `INSERT INTO images (character, slot, mime, object_key, size, uploaded_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (character, slot) DO UPDATE SET
       mime = EXCLUDED.mime,
       object_key = EXCLUDED.object_key,
       size = EXCLUDED.size,
       uploaded_at = EXCLUDED.uploaded_at`,
    [character, slot, mime, key, data.length, nowMs()]
  );
}

export async function getImage(character: string, slot: string): Promise<ImageRow | null> {
  const { rows } = await pool.query(
    `SELECT character, slot, mime, object_key, size, uploaded_at FROM images WHERE character = $1 AND slot = $2`,
    [character, slot]
  );
  const r = rows[0];
  if (!r) return null;
  const meta = {
    character: r.character,
    slot: r.slot,
    mime: r.mime,
    size: r.size,
    uploadedAt: Number(r.uploaded_at),
  };

  // 1) Үндсэн эх сурвалж: MinIO (object_key байгаа бол).
  if (r.object_key) {
    const got = await getObjectOrNull(r.object_key);
    if (got) return { ...meta, data: got.buffer };
    // object_key байгаа ч object алга → доорх legacy BYTEA руу шилжинэ (self-heal)
  }

  // 2) Fallback: хуучин BYTEA (migration дуусаагүй мөрүүд эсвэл object алга болсон).
  //    Энэ нь cut-over үед (S3 тохируулаагүй/backfill ороогүй) зургийг тасрахаас сэргийлнэ.
  const legacy = await readLegacyBytea(character, slot);
  if (legacy) return { ...meta, data: legacy };
  return null;
}

/** MinIO-оос object татна; алга бол (NoSuchKey/404) null буцаана, бусад алдааг дамжуулна. */
async function getObjectOrNull(key: string): Promise<{ buffer: Buffer } | null> {
  try {
    return await getObject(key);
  } catch (e) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

/** Хуучин BYTEA байтуудыг уншина; `data` багана устгагдсан бол null (алдаа шидэхгүй). */
async function readLegacyBytea(character: string, slot: string): Promise<Buffer | null> {
  try {
    const { rows } = await pool.query(`SELECT data FROM images WHERE character = $1 AND slot = $2`, [
      character, slot,
    ]);
    return (rows[0]?.data as Buffer) ?? null;
  } catch {
    return null; // `data` багана аль хэдийн устгагдсан (finalize-ийн дараа)
  }
}

export async function removeImage(character: string, slot: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT object_key FROM images WHERE character = $1 AND slot = $2`, [
    character, slot,
  ]);
  const r = rows[0];
  if (!r) return false;
  await pool.query(`DELETE FROM images WHERE character = $1 AND slot = $2`, [character, slot]);
  await tryDeleteObject(r.object_key); // best-effort — orphan object нь хор хөнөөлгүй
  return true;
}

/** Object устгал амжилтгүй болсон ч DB-г блоклохгүй (orphan нь хор хөнөөлгүй). */
async function tryDeleteObject(key: string | null | undefined): Promise<void> {
  if (!key) return;
  try {
    await deleteObject(key);
  } catch (e) {
    console.error(`deleteObject failed for ${key}:`, e);
  }
}

// ───────────────── IMAGE STORAGE MIGRATION (Postgres BYTEA → MinIO) ─────────────────

/** Хуучин `data` BYTEA багана одоо хүртэл байгаа эсэх. */
async function hasDataColumn(): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 'data'`
  );
  return rows.length > 0;
}

/**
 * Postgres BYTEA дотор хадгалагдсан хуучин зургуудыг MinIO руу зөөнө (additive,
 * idempotent). object_key хоосон мөрүүдийг л боловсруулна — эхлүүлэх үед дуудна.
 * @returns зөөгдсөн мөрийн тоо
 */
export async function backfillImagesToStorage(): Promise<number> {
  if (!storageEnabled()) return 0;
  if (!(await hasDataColumn())) return 0; // аль хэдийн бүрэн шилжсэн
  const { rows } = await pool.query(
    `SELECT character, slot, mime, data FROM images WHERE object_key IS NULL AND data IS NOT NULL`
  );
  let migrated = 0;
  for (const r of rows) {
    const key = imageKey(r.character, r.slot);
    await putObject(key, r.data as Buffer, r.mime);
    await pool.query(`UPDATE images SET object_key = $1 WHERE character = $2 AND slot = $3`, [
      key, r.character, r.slot,
    ]);
    migrated++;
  }
  return migrated;
}

/**
 * Бүрэн migration: бүх байтыг MinIO руу зөөж, баталгаажуулаад `data` BYTEA
 * баганыг устгана. Серверт нэг удаа гар аргаар ажиллуулна (scripts/migrate-images-to-minio.ts).
 */
export async function finalizeImageStorageMigration(): Promise<{ migrated: number; verified: number; dropped: boolean }> {
  if (!storageEnabled()) throw new Error('storage not configured — set S3_* env first');
  const migrated = await backfillImagesToStorage();

  const { rows: nullRows } = await pool.query(`SELECT COUNT(*)::int AS n FROM images WHERE object_key IS NULL`);
  if (nullRows[0].n > 0) {
    throw new Error(`${nullRows[0].n} image row(s) still missing object_key — aborting column drop`);
  }

  // Багана устгахаас ӨМНӨ MinIO-оос УНШИЖ баталгаажуулна — object_key flag биш,
  // жинхэнэ байтууд найдвартай хадгалагдсаныг шалгана. Буруу bucket / дутуу
  // migration / object алга бол энд таслан зогсооно (data-loss-аас сэргийлнэ).
  const hadData = await hasDataColumn();
  const { rows } = await pool.query(
    hadData
      ? `SELECT character, slot, object_key, size, data FROM images`
      : `SELECT character, slot, object_key, size FROM images`
  );
  let verified = 0;
  for (const r of rows) {
    if (!r.object_key) throw new Error(`row ${r.character}/${r.slot} missing object_key — aborting`);
    const { buffer } = await getObject(r.object_key); // object алга бол алдаа → таслана
    if (hadData && r.data != null) {
      // Хуучин мөр: MinIO хувь нь устгах гэж буй Postgres байттай ЯГ ижил эсэх.
      if (!buffer.equals(r.data as Buffer)) {
        throw new Error(`MinIO object ${r.object_key} does NOT match Postgres bytes — aborting DROP`);
      }
    } else if (buffer.length !== r.size) {
      // Шинэ (object-only) мөр: хэмжээ таарч буй эсэх.
      throw new Error(`MinIO object ${r.object_key} size ${buffer.length} != expected ${r.size} — aborting DROP`);
    }
    verified++;
  }

  // Бүх мөр байт-баталгаажсан → BYTEA баганыг аюулгүйгээр устгана.
  let dropped = false;
  if (hadData) {
    await pool.query(`ALTER TABLE images ALTER COLUMN object_key SET NOT NULL`);
    await pool.query(`ALTER TABLE images DROP COLUMN data`);
    dropped = true;
  }
  return { migrated, verified, dropped };
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
