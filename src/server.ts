import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { renderCard, renderSvg } from './render.js';
import { generateImagePng } from './images.js';
import {
  seedIfEmpty,
  reseed,
  listDrafts,
  getDraft,
  updateDraft,
  resetDraft,
  markDone,
  setImage,
  getImage,
  removeImage,
  addRender,
  getRender,
  listRenders,
} from './db.js';
import type { CardData, ImageSlot } from './types.js';

// ───────────────── INIT DB ─────────────────
import { initDb } from './db.js';
await initDb();
const seed = await seedIfEmpty();
if (seed.seeded > 0) console.log(`▶ DB seeded ${seed.seeded} drafts`);

const app = new Hono();

// gzip — текст/JSON хариуг шахаж удаан холбоос дээр огцом хурдасгана
// (PNG зэрэг аль хэдийн шахагдсан форматыг дахин шахахгүй)
app.use('*', async (c, next) => {
  const skip = c.req.path.startsWith('/api/images/') || c.req.path.startsWith('/api/renders/');
  if (skip) return next();
  return compress()(c, next);
});

// ───────────────── INFO ─────────────────
app.get('/api', (c) =>
  c.json({
    name: 'kanji-mn',
    storage: 'sqlite (data/kanjimn.db)',
    endpoints: {
      'GET /api/drafts':                              'list 30 drafts (summary)',
      'GET /api/drafts/:character':                   'one draft (full data + image flags)',
      'PATCH /api/drafts/:character':                 'deep-merge update of card data',
      'POST /api/drafts/:character/reset':            'revert to seed + clear images',
      'PUT /api/drafts/:character/images/:slot':      'multipart upload',
      'POST /api/drafts/:character/generate-image/:slot': 'AI-generate via OpenAI using stored prompt',
      'DELETE /api/drafts/:character/images/:slot':   'clear uploaded image',
      'GET /api/images/:character/:slot':             'binary (img src)',
      'POST /api/drafts/:character/render':           'render + persist + return PNG/SVG/etc',
      'GET /api/drafts/:character/renders':           'render history',
      'GET /api/renders/:id':                         'past render binary',
      'POST /api/admin/reseed':                       'force-import drafts.json',
      'POST /api/generate':                           '(standalone) JSON body → render, no DB',
      'POST /api/upload':                             '(standalone) ad-hoc file → base64 data URL',
      'GET /health':                                  'ok',
    },
  })
);

app.get('/health', (c) => c.text('ok'));

// ───────────────── DB-BACKED DRAFTS ─────────────────
app.get('/api/drafts', async (c) => c.json(await listDrafts()));

app.get('/api/drafts/:character', async (c) => {
  const d = await getDraft(c.req.param('character'));
  if (!d) return c.json({ error: 'not found' }, 404);
  return c.json(d);
});

app.patch('/api/drafts/:character', async (c) => {
  let patch: Partial<CardData>;
  try { patch = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
  if (!patch || typeof patch !== 'object') return c.json({ error: 'body must be object' }, 400);
  const d = await updateDraft(c.req.param('character'), patch);
  if (!d) return c.json({ error: 'not found' }, 404);
  return c.json(d);
});

app.post('/api/drafts/:character/reset', async (c) => {
  const d = await resetDraft(c.req.param('character'));
  if (!d) return c.json({ error: 'not found' }, 404);
  return c.json(d);
});

// ───────────────── IMAGES ─────────────────
const VALID_SLOTS = new Set(['main', 'evolution', 'icon']);

app.put('/api/drafts/:character/images/:slot', async (c) => {
  const character = c.req.param('character');
  const slot = c.req.param('slot') as 'main' | 'evolution' | 'icon';
  if (!VALID_SLOTS.has(slot)) return c.json({ error: 'invalid slot' }, 400);
  if (!(await getDraft(character))) return c.json({ error: 'character not found' }, 404);

  try {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return c.json({ error: 'file field required' }, 400);
    if (file.size > 10 * 1024 * 1024) return c.json({ error: 'file too large (>10MB)' }, 400);
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || 'image/png';
    await setImage(character, slot, mime, buf);
    return c.json({ character, slot, mime, size: file.size });
  } catch (e: any) {
    return c.json({ error: e?.message ?? 'upload failed' }, 500);
  }
});

/**
 * AI-generate one slot's image using the prompt stored on the draft.
 * Body (optional): { prompt: string } — overrides DB prompt for this call only.
 */
app.post('/api/drafts/:character/generate-image/:slot', async (c) => {
  const character = c.req.param('character');
  const slot = c.req.param('slot') as 'main' | 'evolution' | 'icon';
  if (!VALID_SLOTS.has(slot)) return c.json({ error: 'invalid slot' }, 400);

  const draft = await getDraft(character);
  if (!draft) return c.json({ error: 'character not found' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const prompt = (body?.prompt as string) || draft.data.prompts?.[slot];
  if (!prompt) return c.json({ error: `no prompt set for slot "${slot}"` }, 400);

  const size: '1024x1024' | '1536x1024' = slot === 'evolution' ? '1536x1024' : '1024x1024';

  try {
    const t0 = Date.now();
    const png = await generateImagePng(prompt, size);
    await setImage(character, slot, 'image/png', png);
    return c.json({
      character, slot, mime: 'image/png',
      size: png.length, ms: Date.now() - t0,
    });
  } catch (e: any) {
    console.error(e);
    return c.json({ error: e?.message ?? 'AI generation failed' }, 500);
  }
});

app.delete('/api/drafts/:character/images/:slot', async (c) => {
  const slot = c.req.param('slot');
  if (!VALID_SLOTS.has(slot)) return c.json({ error: 'invalid slot' }, 400);
  const ok = await removeImage(c.req.param('character'), slot);
  if (!ok) return c.json({ error: 'no image to delete' }, 404);
  return c.json({ removed: true });
});

app.get('/api/images/:character/:slot', async (c) => {
  const slot = c.req.param('slot');
  if (!VALID_SLOTS.has(slot)) return c.json({ error: 'invalid slot' }, 400);
  const row = await getImage(c.req.param('character'), slot);
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.body(row.data as any, 200, {
    'Content-Type': row.mime,
    'Cache-Control': 'no-cache',
  });
});

// ───────────────── RENDER (DB-backed) ─────────────────
app.post('/api/drafts/:character/render', async (c) => {
  const character = c.req.param('character');
  const draft = await getDraft(character);
  if (!draft) return c.json({ error: 'not found' }, 404);

  const format = (c.req.query('format') ?? 'png') as 'png' | 'svg' | 'webp' | 'jpeg' | 'base64';
  const noAI = c.req.query('noai') === '1';

  // Build images: uploaded > slot config in data > sensible default
  const images: NonNullable<CardData['images']> = {};
  for (const slot of ['main', 'evolution', 'icon'] as const) {
    if (draft.hasImages[slot]) {
      const row = (await getImage(character, slot))!;
      images[slot] = { kind: 'base64', mime: row.mime as any, data: row.data.toString('base64') };
    } else {
      const fromData = draft.data.images?.[slot];
      if (fromData) images[slot] = fromData;
      else if (slot === 'icon') images[slot] = { kind: 'emoji', emoji: '🌲' };
      else images[slot] = noAI ? undefined as any : { kind: 'auto' };
    }
  }
  const card: CardData = { ...draft.data, images };

  try {
    if (format === 'svg') {
      const svg = await renderSvg(card, { noAI });
      // store as bytes for consistency
      await addRender(character, 'svg', Buffer.from(svg));
      await markDone(character);
      return c.body(svg, 200, { 'Content-Type': 'image/svg+xml' });
    }

    const png = await renderCard(card, {
      format: format === 'base64' ? 'png' : (format as any),
      noAI,
    });
    await addRender(character, format === 'base64' ? 'png' : format, png);
    await markDone(character);

    if (format === 'base64') return c.json({ image: `data:image/png;base64,${png.toString('base64')}` });

    const mime = format === 'webp' ? 'image/webp' : format === 'jpeg' ? 'image/jpeg' : 'image/png';
    return c.body(png as any, 200, { 'Content-Type': mime });
  } catch (e: any) {
    console.error(e);
    return c.json({ error: e?.message ?? 'render failed' }, 500);
  }
});

app.get('/api/drafts/:character/renders', async (c) => {
  return c.json(await listRenders(c.req.param('character')));
});

app.get('/api/renders/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const r = await getRender(id);
  if (!r) return c.json({ error: 'not found' }, 404);
  const mime =
    r.format === 'svg' ? 'image/svg+xml' :
    r.format === 'webp' ? 'image/webp' :
    r.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return c.body(r.data as any, 200, { 'Content-Type': mime });
});

// ───────────────── ADMIN ─────────────────
app.post('/api/admin/reseed', async (c) => c.json(await reseed()));

// ───────────────── STANDALONE (no DB) ─────────────────
app.post('/api/generate', async (c) => {
  let body: CardData;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }

  const err = validate(body);
  if (err) return c.json({ error: err }, 400);

  const format = c.req.query('format') ?? 'png';
  const noAI = c.req.query('noai') === '1';

  try {
    if (format === 'svg') {
      const svg = await renderSvg(body, { noAI });
      return c.body(svg, 200, { 'Content-Type': 'image/svg+xml' });
    }
    if (format === 'base64') {
      const png = await renderCard(body, { format: 'png', noAI });
      return c.json({ image: `data:image/png;base64,${png.toString('base64')}` });
    }
    const out = await renderCard(body, { format: format as any, noAI });
    const mime = format === 'webp' ? 'image/webp' : format === 'jpeg' ? 'image/jpeg' : 'image/png';
    return c.body(out as any, 200, { 'Content-Type': mime });
  } catch (e: any) {
    console.error(e);
    return c.json({ error: e?.message ?? 'render failed' }, 500);
  }
});

app.post('/api/upload', async (c) => {
  try {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return c.json({ error: 'file field required' }, 400);
    if (file.size > 10 * 1024 * 1024) return c.json({ error: 'file too large (>10MB)' }, 400);
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || 'image/png';
    return c.json({
      dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
      mime, size: file.size, name: file.name,
    });
  } catch (e: any) {
    return c.json({ error: e?.message ?? 'upload failed' }, 500);
  }
});

function validate(d: any): string | null {
  if (!d || typeof d !== 'object') return 'body must be JSON object';
  if (!d.character) return 'character required';
  if (!d.pinyin) return 'pinyin required';
  if (!d.meaning) return 'meaning required';
  if (!d.structure?.parts?.length || !d.structure?.result?.char) return 'structure { parts, result } required';
  if (!d.story) return 'story required';
  if (!d.example?.word || !d.example?.pinyin || !d.example?.translation) return 'example required';
  return null;
}

// Static frontend (must come LAST so /api/* matches first)
app.use('/*', serveStatic({ root: './public' }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => {
  console.log(`▶ kanji-mn running on http://localhost:${port}`);
  console.log(`  UI:  http://localhost:${port}/`);
  console.log(`  API: http://localhost:${port}/api`);
});
