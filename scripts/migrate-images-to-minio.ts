#!/usr/bin/env tsx
/**
 * Нэг удаагийн миграци: Postgres `images.data` (BYTEA) → MinIO object storage.
 * Бүх байтыг MinIO руу зөөж, баталгаажуулаад `data` BYTEA баганыг устгана.
 *
 * Серверт env тохируулсны дараа НЭГ удаа ажиллуулна:
 *   set -a; source /opt/edugo/.env; set +a
 *   npx tsx scripts/migrate-images-to-minio.ts
 *
 * Шаардлагатай env: DATABASE_URL (эсвэл default socket),
 *   S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY
 *
 * Idempotent: дахин ажиллуулахад аюулгүй (аль хэдийн зөөгдсөн бол 0 зөөнө).
 */
import { initDb, finalizeImageStorageMigration, pool } from '../src/db.js';
import { storageEnabled, ensureBucket, bucket } from '../src/storage.js';

if (!storageEnabled()) {
  console.error('✖ S3_* env not set (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY). Aborting.');
  process.exit(1);
}

console.log(`▶ bucket: ${bucket()}`);
await initDb();            // object_key багана нэмэх + data NOT NULL сулруулах (idempotent)
await ensureBucket();      // bucket байхгүй бол үүсгэх

const { migrated, verified, dropped } = await finalizeImageStorageMigration();
console.log(`✔ migrated ${migrated}, verified ${verified} object(s) byte-for-byte; data column dropped: ${dropped}`);

await pool.end();
