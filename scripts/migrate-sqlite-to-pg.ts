#!/usr/bin/env tsx
/**
 * Нэг удаагийн миграци: data/kanjimn.db (SQLite) → PostgreSQL.
 * Drafts (is_done, updated_at хадгална), images, renders бүгдийг зөөнө.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/migrate-sqlite-to-pg.ts [path/to/kanjimn.db]
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { initDb, pool } from '../src/db.js';

const SQLITE_PATH = process.argv[2] ?? resolve(import.meta.dirname, '..', 'data', 'kanjimn.db');

const sq = new Database(SQLITE_PATH, { readonly: true });
console.log(`◀ source: ${SQLITE_PATH}`);

await initDb();

const drafts = sq.prepare('SELECT character, position, data, is_done, updated_at FROM drafts').all() as any[];
const images = sq.prepare('SELECT character, slot, mime, data, size, uploaded_at FROM images').all() as any[];
const renders = sq.prepare('SELECT character, format, data, size, rendered_at FROM renders ORDER BY id').all() as any[];

const client = await pool.connect();
try {
  await client.query('BEGIN');

  for (const d of drafts) {
    await client.query(
      `INSERT INTO drafts (character, position, data, is_done, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (character) DO UPDATE SET
         position = EXCLUDED.position, data = EXCLUDED.data,
         is_done = EXCLUDED.is_done, updated_at = EXCLUDED.updated_at`,
      [d.character, d.position, d.data, !!d.is_done, d.updated_at]
    );
  }

  for (const im of images) {
    await client.query(
      `INSERT INTO images (character, slot, mime, data, size, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (character, slot) DO UPDATE SET
         mime = EXCLUDED.mime, data = EXCLUDED.data,
         size = EXCLUDED.size, uploaded_at = EXCLUDED.uploaded_at`,
      [im.character, im.slot, im.mime, im.data, im.size, im.uploaded_at]
    );
  }

  for (const r of renders) {
    await client.query(
      `INSERT INTO renders (character, format, data, size, rendered_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [r.character, r.format, r.data, r.size, r.rendered_at]
    );
  }

  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}

const done = drafts.filter((d) => d.is_done).length;
console.log(`✓ migrated: ${drafts.length} drafts (${done} done), ${images.length} images, ${renders.length} renders`);
await pool.end();
sq.close();
