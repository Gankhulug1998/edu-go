import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { renderCard, renderSvg } from './render.js';
import { generateImage, aiSpecForSlot } from './images.js';
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
  backfillImagesToStorage,
} from './db.js';
import { ensureBucket, storageEnabled } from './storage.js';
import type { CardData, ImageSlot } from './types.js';

// ───────────────── INIT DB ─────────────────
import { initDb } from './db.js';
await initDb();
const seed = await seedIfEmpty();
if (seed.seeded > 0) console.log(`▶ DB seeded ${seed.seeded} drafts`);

// ───────────────── INIT OBJECT STORAGE (MinIO) ─────────────────
// Storage init нь сайтыг УНАГААХ ёсгүй: MinIO унтарсан/буруу тохируулагдсан ч
// сервер ажиллана (зураг түр degraded, бусад route хэвийн). getImage нь хуучин
// BYTEA руу fallback хийдэг тул migration дуусаагүй үед ч зураг тасрахгүй.
if (storageEnabled()) {
  try {
    await ensureBucket();
    const migrated = await backfillImagesToStorage();
    if (migrated > 0) console.log(`▶ Migrated ${migrated} image(s) Postgres→MinIO`);
    console.log('▶ Object storage (MinIO) ready');
  } catch (e) {
    console.error('⚠ Object storage init failed — serving continues (images may be degraded):', e);
  }
} else {
  console.warn('⚠ Object storage (S3_*/MinIO) NOT configured — falling back to legacy BYTEA if present.');
}

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
    name: 'edu-go',
    storage: 'postgres (metadata) + minio (image bytes)',
    endpoints: {
      'GET /api/drafts':                              'list 30 drafts (summary)',
      'GET /api/drafts/:character':                   'one draft (full data + image flags)',
      'PATCH /api/drafts/:character':                 'deep-merge update of card data',
      'POST /api/drafts/:character/reset':            'revert to seed + clear images',
      'PUT /api/drafts/:character/images/:slot':      'multipart upload',
      'POST /api/drafts/:character/generate-image/:slot': 'AI-generate via OpenAI using stored prompt',
      'DELETE /api/drafts/:character/images/:slot':   'clear uploaded image',
      'GET /api/images/:character/:slot':             'binary (img src)',
      'POST /api/drafts/:character/render':           'render + cache AI images + persist + return PNG/SVG/etc',
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
    const { buffer, mime } = await generateImage(prompt, size);
    await setImage(character, slot, mime, buffer);
    return c.json({
      character, slot, mime,
      size: buffer.length, ms: Date.now() - t0,
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
  try {
    const row = await getImage(c.req.param('character'), slot);
    if (!row) return c.json({ error: 'not found' }, 404);
    return c.body(row.data as any, 200, {
      'Content-Type': row.mime,
      'Cache-Control': 'no-cache',
    });
  } catch (e: any) {
    console.error(e);
    return c.json({ error: e?.message ?? 'failed to load image' }, 500);
  }
});

// ───────────────── RENDER (DB-backed) ─────────────────

// In-flight AI image generations, keyed by character+slot. Dedups concurrent
// renders of the same uncached card so OpenAI is billed once and both callers
// receive the SAME bytes (no divergent images, no double cost).
const inflightImages = new Map<string, Promise<{ buffer: Buffer; mime: string }>>();
function generateImageDedup(
  character: string,
  slot: string,
  prompt: string,
  size: '1024x1024' | '1024x1536' | '1536x1024'
): Promise<{ buffer: Buffer; mime: string }> {
  const key = `${character}:${slot}`;
  const existing = inflightImages.get(key);
  if (existing) return existing;
  const p = generateImage(prompt, size);
  inflightImages.set(key, p);
  const cleanup = () => inflightImages.delete(key);
  p.then(cleanup, cleanup); // drop from map once settled (ok/err)
  return p;
}

app.post('/api/drafts/:character/render', async (c) => {
  const character = c.req.param('character');
  const draft = await getDraft(character);
  if (!draft) return c.json({ error: 'not found' }, 404);

  const format = (c.req.query('format') ?? 'png') as 'png' | 'svg' | 'webp' | 'jpeg' | 'base64';
  const noAI = c.req.query('noai') === '1';

  try {
    // Build images per slot. AI slots (auto/prompt) are generated ONCE, deduped
    // across concurrent renders, and persisted to the images table ONLY AFTER a
    // successful render — so later renders reuse the stored image instead of
    // re-calling OpenAI, and an image that can't actually be drawn is never cached.
    const images: NonNullable<CardData['images']> = {};
    const freshlyGenerated: Array<{ slot: 'main' | 'evolution' | 'icon'; mime: string; buffer: Buffer }> = [];

    for (const slot of ['main', 'evolution', 'icon'] as const) {
      // 1) Already stored (uploaded earlier OR previously AI-generated & cached).
      if (draft.hasImages[slot]) {
        const row = await getImage(character, slot);
        if (row) {
          images[slot] = { kind: 'base64', mime: row.mime as any, data: row.data.toString('base64') };
          continue;
        }
        // metadata байгаа ч байт алга (MinIO drift) → доош унаж дахин үүсгэнэ/алгасна
      }

      // 2) Pick the effective slot config: explicit data config, else slot default.
      let cfg: ImageSlot | undefined = draft.data.images?.[slot];
      if (!cfg) {
        if (slot === 'icon') cfg = { kind: 'emoji', emoji: '🌲' };
        else if (!noAI) cfg = { kind: 'auto' };
      }
      if (!cfg) continue; // nothing to draw — template shows fallback

      // 3) Slots that need OpenAI: generate once (deduped), use now, persist later.
      const ai = noAI ? null : aiSpecForSlot(cfg, slot, draft.data);
      if (ai) {
        const { buffer, mime } = await generateImageDedup(character, slot, ai.prompt, ai.size);
        images[slot] = { kind: 'base64', mime: mime as any, data: buffer.toString('base64') };
        freshlyGenerated.push({ slot, mime, buffer });
        continue;
      }

      // 4) Cheap/deterministic slots (url/base64/emoji) pass straight through.
      images[slot] = cfg;
    }
    const card: CardData = { ...draft.data, images };

    // Persist freshly-generated AI images only once we know the card renders,
    // so a generation that breaks rendering never poisons the cache. Best-effort:
    // a MinIO write hiccup must NOT turn a successful render into a 500 (the slot
    // just stays uncached and regenerates next time).
    const persistFresh = async () => {
      for (const g of freshlyGenerated) {
        try {
          await setImage(character, g.slot, g.mime, g.buffer);
        } catch (e) {
          console.error(`cache persist failed for ${character}/${g.slot} (render still served):`, e);
        }
      }
    };

    if (format === 'svg') {
      const svg = await renderSvg(card, { noAI });
      await persistFresh();
      await addRender(character, 'svg', Buffer.from(svg));
      await markDone(character);
      return c.body(svg, 200, { 'Content-Type': 'image/svg+xml' });
    }

    const png = await renderCard(card, {
      format: format === 'base64' ? 'png' : (format as any),
      noAI,
    });
    await persistFresh();
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
  console.log(`▶ edu-go running on http://localhost:${port}`);
  console.log(`  UI:  http://localhost:${port}/`);
  console.log(`  API: http://localhost:${port}/api`);
});
