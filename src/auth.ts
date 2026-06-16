import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { pool } from './db.js';

// ────────────────────────────────────────────────────────────────────────────
// Learner auth: email/password (scrypt — no external deps) + session tokens
// stored in Postgres, carried in an httpOnly cookie. Google OAuth users are
// upserted by email (no password). See server.ts for the HTTP layer.
// ────────────────────────────────────────────────────────────────────────────

const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'edugo_session';
const nowMs = () => Date.now();

// ───────────────── PASSWORD HASHING (scrypt) ─────────────────
export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const got = scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// ───────────────── USERS ─────────────────
export interface User {
  id: number;
  email: string;
  name: string | null;
  provider: string; // 'email' | 'google'
  createdAt: number;
}

function rowToUser(r: any): User {
  return { id: r.id, email: r.email, name: r.name, provider: r.provider, createdAt: Number(r.created_at) };
}

export async function createUser(
  email: string,
  name: string | null,
  passwordHash: string | null,
  provider = 'email'
): Promise<User> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, password_hash, provider, created_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [email.toLowerCase().trim(), name, passwordHash, provider, nowMs()]
  );
  return rowToUser(rows[0]);
}

export async function getUserByEmail(
  email: string
): Promise<(User & { passwordHash: string | null }) | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
  if (!rows[0]) return null;
  return { ...rowToUser(rows[0]), passwordHash: rows[0].password_hash };
}

export async function getUserById(id: number): Promise<User | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

/** Find-or-create by email for OAuth providers (Google). */
export async function upsertOAuthUser(email: string, name: string | null, provider: string): Promise<User> {
  const existing = await getUserByEmail(email);
  if (existing) return existing;
  return createUser(email, name, null, provider);
}

// ───────────────── SESSIONS ─────────────────
export async function createSession(userId: number): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = nowMs() + SESSION_DAYS * 86400_000;
  await pool.query(
    `INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)`,
    [token, userId, expiresAt, nowMs()]
  );
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > $2`,
    [token, nowMs()]
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
}

// ───────────────── PROGRESS ─────────────────
/** character → status ('studied' | 'known') */
export async function getProgress(userId: number): Promise<Record<string, string>> {
  const { rows } = await pool.query(`SELECT character, status FROM progress WHERE user_id = $1`, [userId]);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.character] = r.status;
  return map;
}

export async function setProgress(userId: number, character: string, status: string): Promise<void> {
  await pool.query(
    `INSERT INTO progress (user_id, character, status, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, character) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
    [userId, character, status, nowMs()]
  );
}

export async function removeProgress(userId: number, character: string): Promise<void> {
  await pool.query(`DELETE FROM progress WHERE user_id = $1 AND character = $2`, [userId, character]);
}

// ───────────────── SRS (spaced repetition: Leitner 6-box, SM-2 lite) ─────────────────
const INTERVALS_DAYS = [0, 1, 3, 7, 16, 35]; // box 0..5
const DAY_MS = 86_400_000;
const DAILY_GOAL = 10;

export type SrsItem = { box: number; dueAt: number | null; lapses: number; status: string };
export type SrsState = {
  items: Record<string, SrsItem>;
  stats: { streak: number; today: { reviews: number; xp: number; goal: number }; totalXp: number; dueCount: number };
};

function addDaysStr(d: string, delta: number): string {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** Grade a review (0=again,1=hard,2=good,3=easy) → update SRS box/due + daily XP. */
export async function gradeCard(userId: number, character: string, grade: number): Promise<SrsItem> {
  const g = Math.max(0, Math.min(3, Math.round(grade || 0)));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // FOR UPDATE serializes concurrent grades of the same card → no lost box/streak/lapses update.
    const { rows } = await client.query(
      `SELECT box, streak, lapses FROM progress WHERE user_id=$1 AND character=$2 FOR UPDATE`,
      [userId, character]
    );
    let box = rows[0]?.box ?? 0;
    let streak = rows[0]?.streak ?? 0;
    let lapses = rows[0]?.lapses ?? 0;
    if (g >= 2) { box = Math.min(box + 1, 5); streak += 1; }
    else { box = Math.max(box - 1, 0); streak = 0; lapses += 1; }
    let intervalDays = INTERVALS_DAYS[box];
    if (g === 3) intervalDays = Math.round(intervalDays * 1.5);
    const dueAt = nowMs() + intervalDays * DAY_MS;
    const status = box >= 4 ? 'known' : 'studied';
    await client.query(
      `INSERT INTO progress (user_id, character, status, updated_at, box, due_at, streak, lapses, last_grade)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, character) DO UPDATE SET
         status=EXCLUDED.status, updated_at=EXCLUDED.updated_at, box=EXCLUDED.box,
         due_at=EXCLUDED.due_at, streak=EXCLUDED.streak, lapses=EXCLUDED.lapses, last_grade=EXCLUDED.last_grade`,
      [userId, character, status, nowMs(), box, dueAt, streak, lapses, g]
    );
    const xp = g >= 2 ? (g === 3 ? 15 : 10) : 0;
    await client.query(
      `INSERT INTO daily_activity (user_id, day, reviews, xp) VALUES ($1, CURRENT_DATE, 1, $2)
       ON CONFLICT (user_id, day) DO UPDATE SET reviews = daily_activity.reviews + 1, xp = daily_activity.xp + $2`,
      [userId, xp]
    );
    await client.query('COMMIT');
    return { box, dueAt, lapses, status };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Full SRS map + gamification stats (streak, daily goal, XP, due count). */
export async function getSrsState(userId: number): Promise<SrsState> {
  const now = nowMs();
  const { rows } = await pool.query(`SELECT character, box, due_at, lapses, status FROM progress WHERE user_id=$1`, [userId]);
  const items: Record<string, SrsItem> = {};
  let dueCount = 0;
  for (const r of rows) {
    const dueAt = r.due_at == null ? null : Number(r.due_at);
    items[r.character] = { box: r.box ?? 0, dueAt, lapses: r.lapses ?? 0, status: r.status };
    if (dueAt != null && dueAt <= now) dueCount++;
  }
  const today = (await pool.query(`SELECT CURRENT_DATE::text AS d`)).rows[0].d as string;
  const todayRow = (await pool.query(`SELECT reviews, xp FROM daily_activity WHERE user_id=$1 AND day=CURRENT_DATE`, [userId])).rows[0];
  const total = (await pool.query(`SELECT COALESCE(SUM(xp),0)::int AS x FROM daily_activity WHERE user_id=$1`, [userId])).rows[0].x;
  const dayRows = (await pool.query(`SELECT day::text AS d FROM daily_activity WHERE user_id=$1 ORDER BY day DESC`, [userId])).rows;
  const set = new Set(dayRows.map((r: any) => r.d as string));
  let streak = 0;
  let cursor = today;
  if (!set.has(cursor)) cursor = addDaysStr(cursor, -1);
  while (set.has(cursor)) { streak++; cursor = addDaysStr(cursor, -1); }
  return {
    items,
    stats: { streak, today: { reviews: todayRow?.reviews ?? 0, xp: todayRow?.xp ?? 0, goal: DAILY_GOAL }, totalXp: total, dueCount },
  };
}
