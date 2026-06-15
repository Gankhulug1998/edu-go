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
