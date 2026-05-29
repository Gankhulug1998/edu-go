#!/usr/bin/env tsx
/**
 * Render a single card from a JSON file without starting the server.
 * Usage:  tsx scripts/test-render.ts examples/lin.json output/lin.png [--noai]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { renderCard } from '../src/render.js';
import type { CardData } from '../src/types.js';

const [, , inputPath, outputPath, ...rest] = process.argv;
if (!inputPath || !outputPath) {
  console.error('usage: tsx scripts/test-render.ts <input.json> <output.png> [--noai]');
  process.exit(1);
}

const noAI = rest.includes('--noai');
const data: CardData = JSON.parse(readFileSync(inputPath, 'utf8'));

const t0 = Date.now();
renderCard(data, { noAI })
  .then((buf) => {
    writeFileSync(outputPath, buf);
    console.log(`✓ wrote ${outputPath} (${buf.length} bytes, ${Date.now() - t0}ms)`);
  })
  .catch((e) => {
    console.error(`✗ render failed:`, e);
    process.exit(1);
  });
