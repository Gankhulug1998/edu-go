import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { loadFonts } from './fonts.js';
import { Card, CARD_HEIGHT, CARD_WIDTH, type ResolvedImages } from './template.js';
import { resolveImages } from './images.js';
import type { CardData } from './types.js';

export interface RenderOptions {
  /** Width × height of the final PNG. Default: 1400×1050 (the layout's native size). */
  width?: number;
  height?: number;
  /** Output format. PNG is default. WebP/JPEG via sharp. */
  format?: 'png' | 'webp' | 'jpeg';
  /** JPEG/WebP quality (1-100). */
  quality?: number;
  /** Skip OpenAI calls (useful for tests). */
  noAI?: boolean;
}

/** Full pipeline: data → resolved images → JSX → SVG → PNG buffer. */
export async function renderCard(data: CardData, opts: RenderOptions = {}): Promise<Buffer> {
  const images: ResolvedImages = await resolveImages(data, { allowOpenAI: !opts.noAI });
  return await renderWithImages(data, images, opts);
}

/** Render variant when images are already resolved (e.g. for editor preview). */
export async function renderWithImages(
  data: CardData,
  images: ResolvedImages,
  opts: RenderOptions = {}
): Promise<Buffer> {
  const fonts = loadFonts();

  const svg = await satori(<Card data={data} images={images} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts,
  });

  const targetW = opts.width ?? CARD_WIDTH;
  const targetH = opts.height ?? CARD_HEIGHT;

  // Render SVG → PNG via resvg (better font handling than sharp for SVG)
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: targetW },
    background: 'rgba(0,0,0,0)',
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();

  // Optional re-encoding via sharp (format conversion / quality)
  const format = opts.format ?? 'png';
  if (format === 'png' && targetW === CARD_WIDTH && targetH === CARD_HEIGHT) {
    return png;
  }

  let pipeline = sharp(png).resize(targetW, targetH, { fit: 'fill' });
  if (format === 'webp') pipeline = pipeline.webp({ quality: opts.quality ?? 90 });
  else if (format === 'jpeg') pipeline = pipeline.jpeg({ quality: opts.quality ?? 92 });
  else pipeline = pipeline.png();
  return await pipeline.toBuffer();
}

/** Render only the SVG (useful for vector output / debugging). */
export async function renderSvg(data: CardData, opts: { noAI?: boolean } = {}): Promise<string> {
  const images = await resolveImages(data, { allowOpenAI: !opts.noAI });
  const fonts = loadFonts();
  return await satori(<Card data={data} images={images} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts,
  });
}
