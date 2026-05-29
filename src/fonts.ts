import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SatoriOptions } from 'satori';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fontDir = resolve(__dirname, '..', 'assets', 'fonts');

function load(file: string): Buffer {
  const path = resolve(fontDir, file);
  if (!existsSync(path)) {
    throw new Error(
      `Font not found: ${path}\n` +
      `→ Run \`npm run fonts\` to download required fonts.`
    );
  }
  return readFileSync(path);
}

let cache: SatoriOptions['fonts'] | null = null;

/**
 * Load all fonts used by the template.
 * - Inter:    Latin + Cyrillic (Mongolian text, pinyin)
 * - NotoSC:   Simplified Chinese sans (example word, small chars)
 * - NotoSerif: Simplified Chinese serif (big calligraphic character)
 *
 * Satori falls back across the font-family stack for missing glyphs,
 * so `font-family: 'Inter', 'NotoSC'` covers Cyrillic+Chinese in one element.
 */
export function loadFonts(): SatoriOptions['fonts'] {
  if (cache) return cache;
  // Inter is split per Unicode subset. List cyrillic-ext FIRST so Mongolian
  // letters (Ү/ү/Ө/ө live at U+04AE/AF/E8/E9 — in cyrillic-ext) resolve before
  // satori would otherwise fall through to a font that lacks them.
  const interSubsets = ['cyrillic-ext', 'cyrillic', 'latin-ext', 'latin'] as const;
  const interFonts = interSubsets.flatMap((subset) => [
    { name: 'Inter', data: load(`Inter-${subset}-400.woff`), weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: load(`Inter-${subset}-700.woff`), weight: 700 as const, style: 'normal' as const },
  ]);
  cache = [
    ...interFonts,
    { name: 'NotoSC',   data: load('SourceHanSansCN-Regular.otf'),   weight: 400, style: 'normal' },
    { name: 'NotoSC',   data: load('SourceHanSansCN-Bold.otf'),      weight: 700, style: 'normal' },
    { name: 'NotoSerif', data: load('SourceHanSerifCN-Bold.otf'),    weight: 700, style: 'normal' },
  ];
  return cache;
}
