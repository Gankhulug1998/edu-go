import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

// ────────────────────────────────────────────────────────────────────────────
// MinIO / S3-compatible object storage for card images.
//
// Зургийн бодит байтуудыг Postgres-д биш, MinIO bucket-д хадгална. `images`
// хүснэгт нь зөвхөн object_key + metadata-г заана.
//
// Env:
//   S3_ENDPOINT     ж: http://127.0.0.1:9000  (MinIO host)
//   S3_BUCKET       ж: edugo
//   S3_ACCESS_KEY   MinIO access key
//   S3_SECRET_KEY   MinIO secret key
//   S3_REGION       заавал биш (default: us-east-1 — MinIO үл хэрэгсэнэ)
// ────────────────────────────────────────────────────────────────────────────

const ENDPOINT = process.env.S3_ENDPOINT;
const BUCKET = process.env.S3_BUCKET;
const ACCESS_KEY = process.env.S3_ACCESS_KEY;
const SECRET_KEY = process.env.S3_SECRET_KEY;
const REGION = process.env.S3_REGION ?? 'us-east-1';

/** Бүх шаардлагатай env өгөгдсөн эсэх — энэгүйгээр зураг хадгалах/унших боломжгүй. */
export function storageEnabled(): boolean {
  return !!(ENDPOINT && BUCKET && ACCESS_KEY && SECRET_KEY);
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  if (!storageEnabled()) {
    throw new Error(
      'Object storage is not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY.'
    );
  }
  _client = new S3Client({
    endpoint: ENDPOINT,
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY!, secretAccessKey: SECRET_KEY! },
    forcePathStyle: true, // MinIO-д заавал (virtual-host style биш)
  });
  return _client;
}

export function bucket(): string {
  if (!BUCKET) throw new Error('S3_BUCKET is not set');
  return BUCKET;
}

/**
 * Картын зургийн object key. Character нь UTF-8 ханз учир key-д шууд тавихгүй,
 * percent-encode хийнэ (зам/URL-д аюулгүй). Slot бүрд нэг key → дарж бичнэ.
 */
export function imageKey(character: string, slot: 'main' | 'evolution' | 'icon'): string {
  return `images/${encodeURIComponent(character)}/${slot}`;
}

/** S3/MinIO алдаа нь "олдсонгүй" (404 / NoSuchKey / NoSuchBucket) эсэх. */
export function isNotFoundError(e: any): boolean {
  const status = e?.$metadata?.httpStatusCode;
  const name = e?.name;
  return status === 404 || name === 'NoSuchKey' || name === 'NotFound' || name === 'NoSuchBucket';
}

/**
 * Bucket байхгүй бол үүсгэнэ (idempotent). Эхлүүлэх үед нэг удаа дуудна.
 * Хувийн bucket дээр HeadBucket нь 403 буцааж болзошгүй (key нь ListBucket-гүй) —
 * энэ тохиолдолд "bucket байгаа" гэж үзэж үргэлжлүүлнэ.
 */
export async function ensureBucket(): Promise<void> {
  const c = client();
  const Bucket = bucket();
  try {
    await c.send(new HeadBucketCommand({ Bucket }));
    return; // байгаа бөгөөд хандах эрхтэй
  } catch (e: any) {
    const status = e?.$metadata?.httpStatusCode;
    const name = e?.name;
    // 403/AccessDenied: bucket байгаа ч HeadBucket эрхгүй — байгаа гэж үзнэ.
    if (status === 403 || name === 'Forbidden' || name === 'AccessDenied') return;
    // 404/NoSuchBucket: үүсгэхийг оролдоно.
    if (isNotFoundError(e)) {
      try {
        await c.send(new CreateBucketCommand({ Bucket }));
      } catch (ce: any) {
        // Зэрэг үүсгэх race эсвэл аль хэдийн байгаа — асуудалгүй.
        if (ce?.name === 'BucketAlreadyOwnedByYou' || ce?.name === 'BucketAlreadyExists') return;
        throw ce;
      }
      return;
    }
    throw e; // жинхэнэ алдаа (сүлжээ/эрх) — startup дээр try/catch-аар барина
  }
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType })
  );
}

export async function getObject(key: string): Promise<{ buffer: Buffer; contentType?: string }> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`object ${key} returned no body`);
  // aws-sdk v3 (Node): Body нь Readable бөгөөд transformToByteArray helper-тэй.
  const bytes = await (res.Body as any).transformToByteArray();
  return { buffer: Buffer.from(bytes), contentType: res.ContentType };
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
