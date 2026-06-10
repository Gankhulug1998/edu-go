import OpenAI from 'openai';
import type { CardData, ImageSlot } from './types.js';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (_openai) return _openai;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Set it in env or use slot.kind="url" / "base64".');
  }
  _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

const MODEL = (process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2') as
  | 'gpt-image-2'
  | 'gpt-image-1'
  | 'dall-e-3';

/** gpt-image-* models return b64_json natively and reject the response_format param. */
const isGptImage = MODEL === 'gpt-image-1' || MODEL === 'gpt-image-2';

// ────────────────────────────────────────────────────────────────────────────
// Public: resolve all 3 image slots into data-URLs ready for the template
// ────────────────────────────────────────────────────────────────────────────

export interface ResolveContext {
  character: string;
  meaning: string;
  pinyin: string;
  /** parts of the character — e.g. ["木","木"] */
  parts: string[];
}

export interface ResolvedImages {
  main?: string;
  evolution?: string;
  icon?: string;
}

export async function resolveImages(
  data: CardData,
  opts: { allowOpenAI?: boolean } = {}
): Promise<ResolvedImages> {
  const ctx: ResolveContext = {
    character: data.character,
    meaning: data.meaning,
    pinyin: data.pinyin,
    parts: data.structure.parts.map((p) => p.char),
  };

  const slots = data.images ?? {};
  const allowAI = opts.allowOpenAI ?? !!process.env.OPENAI_API_KEY;

  const [main, evolution, icon] = await Promise.all([
    resolveOne(slots.main, 'main', ctx, allowAI),
    resolveOne(slots.evolution, 'evolution', ctx, allowAI),
    resolveOne(slots.icon, 'icon', ctx, allowAI),
  ]);

  return { main, evolution, icon };
}

async function resolveOne(
  slot: ImageSlot | undefined,
  kind: 'main' | 'evolution' | 'icon',
  ctx: ResolveContext,
  allowAI: boolean
): Promise<string | undefined> {
  if (!slot) return undefined; // template will show fallback

  switch (slot.kind) {
    case 'url':
      return await fetchAsDataUrl(slot.url);
    case 'base64':
      return `data:${slot.mime ?? 'image/png'};base64,${slot.data}`;
    case 'emoji':
      return await emojiToDataUrl(slot.emoji);
    case 'prompt':
      if (!allowAI) return undefined;
      return await generateOpenAI(slot.prompt, slot.size ?? defaultSize(kind));
    case 'auto':
      if (!allowAI) return undefined;
      return await generateOpenAI(autoPrompt(kind, ctx), defaultSize(kind));
  }
}

function defaultSize(kind: 'main' | 'evolution' | 'icon'): '1024x1024' | '1024x1536' | '1536x1024' {
  if (kind === 'main') return '1024x1024';
  if (kind === 'evolution') return '1536x1024';
  return '1024x1024';
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-prompts (used when slot.kind === 'auto')
// ────────────────────────────────────────────────────────────────────────────

function autoPrompt(kind: 'main' | 'evolution' | 'icon', ctx: ResolveContext): string {
  const englishMeaning = ctx.meaning; // user can also pass an english hint; for now use mn
  switch (kind) {
    case 'main':
      return (
        `A beautiful soft watercolor illustration representing "${englishMeaning}" ` +
        `(Chinese character ${ctx.character}). Peaceful, vibrant, educational style. ` +
        `Centered composition, natural lighting, no text, no characters, no watermark.`
      );
    case 'evolution':
      return (
        `Educational flat illustration: the components ${ctx.parts.join(' and ')} visually combining ` +
        `to form the meaning "${englishMeaning}". Clean white background, no text, no Chinese characters, ` +
        `simple cartoon style, two small objects side-by-side with a subtle arrow.`
      );
    case 'icon':
      return (
        `A minimalist flat vector icon representing "${englishMeaning}". ` +
        `Green color palette, single subject, centered, white background, no text, ` +
        `simple silhouette suitable for a small circular badge.`
      );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// OpenAI gpt-image-1 / dall-e-3
// ────────────────────────────────────────────────────────────────────────────

/**
 * Public: generate an image and return a raw PNG Buffer (not a data URL).
 * Useful for server endpoints that want to store the binary directly.
 */
export async function generateImagePng(
  prompt: string,
  size: '1024x1024' | '1024x1536' | '1536x1024' = '1024x1024'
): Promise<Buffer> {
  const dataUrl = await generateOpenAI(prompt, size);
  const m = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!m) throw new Error('expected data URL from generateOpenAI');
  return Buffer.from(m[1], 'base64');
}

async function generateOpenAI(prompt: string, size: '1024x1024' | '1024x1536' | '1536x1024'): Promise<string> {
  const res = await getOpenAI().images.generate({
    model: MODEL,
    prompt,
    size: MODEL === 'dall-e-3' ? (size === '1024x1024' ? '1024x1024' : '1792x1024') : size,
    n: 1,
    ...(isGptImage ? {} : { response_format: 'b64_json' as const }),
  } as any);

  const first = res.data?.[0];
  if (!first) throw new Error('OpenAI returned no image');

  if (first.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }
  if (first.url) {
    return await fetchAsDataUrl(first.url);
  }
  throw new Error('OpenAI image response missing both b64_json and url');
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function fetchAsDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get('content-type')?.split(';')[0] || guessMime(url);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function guessMime(url: string): string {
  const u = url.toLowerCase();
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

async function emojiToDataUrl(emoji: string): Promise<string> {
  const codepoint = [...emoji]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((cp) => cp !== 'fe0f') // strip VS16
    .join('-');
  const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${codepoint}.svg`;
  return await fetchAsDataUrl(url);
}
