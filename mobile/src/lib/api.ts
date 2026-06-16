import * as SecureStore from 'expo-secure-store';

// NOTE: production needs HTTPS (iOS App Transport Security). The current backend
// is plain http on a bare IP, allowed in dev via NSAllowsArbitraryLoads (app.json).
// Point this at a real https://edugo.mn domain before App Store release.
export const API_BASE = 'http://84.247.165.220:3100';

const TOKEN_KEY = 'edugo_token';
let _token: string | null = null;

export async function loadToken(): Promise<string | null> {
  if (_token) return _token;
  try { _token = await SecureStore.getItemAsync(TOKEN_KEY); } catch { _token = null; }
  return _token;
}
export async function setToken(t: string | null): Promise<void> {
  _token = t;
  try {
    if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {}
}
export function getToken(): string | null { return _token; }

async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers as any) };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  return fetch(`${API_BASE}${path}`, { ...opts, headers });
}

export type Draft = {
  character: string; pinyin: string; meaning: string;
  level?: number; category?: string; isDone: boolean;
  hasImages: { main: boolean; evolution: boolean; icon: boolean };
};
export type User = { id: number; email: string; name: string | null; provider: string; createdAt: number };
export type Pack = { levels: { id: number; slug: string; name: string }[]; categories: { slug: string; name: string; icon?: string }[] };

export const api = {
  drafts: () => apiFetch('/api/drafts').then((r) => r.json() as Promise<Draft[]>),
  packs: () => apiFetch('/packs.json').then((r) => r.json() as Promise<Pack>),
  me: () => apiFetch('/api/auth/me').then((r) => r.json()).then((d) => d.user as User | null).catch(() => null),
  card: (ch: string) => apiFetch(`/api/cards/${encodeURIComponent(ch)}`).then((r) => r.json()),
  progress: () => apiFetch('/api/me/progress').then((r) => (r.ok ? r.json() : { progress: {} })).then((d) => d.progress as Record<string, string>),
  setProgress: (ch: string, status: string) =>
    apiFetch(`/api/me/progress/${encodeURIComponent(ch)}`, { method: 'PUT', body: JSON.stringify({ status }) }),
  removeProgress: (ch: string) => apiFetch(`/api/me/progress/${encodeURIComponent(ch)}`, { method: 'DELETE' }),
  async login(email: string, password: string) {
    const r = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Нэвтрэх амжилтгүй');
    return d as { token: string; user: User };
  },
  async signup(email: string, password: string, name?: string) {
    const r = await apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Бүртгэл амжилтгүй');
    return d as { token: string; user: User };
  },
  logout: () => apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {}),
  fullCard: (ch: string) =>
    apiFetch(`/api/cards/${encodeURIComponent(ch)}`).then(async (r) => {
      if (!r.ok) throw new Error('card unavailable'); // locked (403) / missing — reject so callers can filter it out
      return (await r.json()).data as FullCard;
    }),
  srs: () => apiFetch('/api/me/srs').then((r) => r.json() as Promise<SrsState>),
  grade: (ch: string, grade: number) =>
    apiFetch(`/api/me/srs/${encodeURIComponent(ch)}`, { method: 'PUT', body: JSON.stringify({ grade }) }).catch(() => {}),
};

export type FullCard = {
  character: string; pinyin: string; meaning: string;
  level?: number; category?: string; tags?: string[];
  structure?: { parts: { char: string; label: string }[]; result: { char: string; label: string } };
  story?: string; storyFormula?: string;
  example?: { word: string; pinyin: string; translation: string };
  images?: { icon?: { kind: string; emoji?: string } };
};
export type SrsItem = { box: number; dueAt: number | null; lapses: number; status: string };
export type SrsState = {
  items: Record<string, SrsItem>;
  stats: { streak: number; today: { reviews: number; xp: number; goal: number }; totalXp: number; dueCount: number };
};

// Authenticated image source for <Image> (gallery / card render)
export function cardImageSource(ch: string) {
  return {
    uri: `${API_BASE}/api/cards/${encodeURIComponent(ch)}/image`,
    headers: _token ? { Authorization: `Bearer ${_token}` } : undefined,
  };
}
