#!/usr/bin/env tsx
/**
 * Batch-generate AI images for kanji-mn drafts.
 *
 * Iterates through drafts via the API and POSTs to
 * /api/drafts/:character/generate-image/:slot for each missing image.
 *
 * USAGE
 *   # All slots for all characters that aren't done yet:
 *   npx tsx scripts/batch-generate.ts
 *
 *   # Only "main" slot, all characters:
 *   npx tsx scripts/batch-generate.ts --slot main
 *
 *   # Specific characters, all slots:
 *   npx tsx scripts/batch-generate.ts --char 林,森,明
 *
 *   # Force re-generate even if image already uploaded:
 *   npx tsx scripts/batch-generate.ts --force
 *
 *   # Different server host:
 *   API=http://other-host:3000 npx tsx scripts/batch-generate.ts
 *
 * CODEX USAGE
 *   codex 'run npx tsx scripts/batch-generate.ts --slot main to generate
 *   the main forest scene for every draft, then iterate slot=evolution and
 *   slot=icon. Server is running at localhost:3000 with OPENAI_API_KEY set.'
 *
 * COST
 *   gpt-image-1 ≈ $0.04 per 1024×1024 image (and $0.06 per 1536×1024).
 *   30 drafts × 3 slots ≈ $3.60–4.20 for a full run.
 *
 * REQUIREMENTS
 *   - kanji-mn server running (default: http://localhost:3000)
 *   - OPENAI_API_KEY exported in the server's environment
 */
import process from 'node:process';

const API = process.env.API ?? 'http://localhost:3000';
const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
function hasFlag(name: string): boolean { return args.includes(`--${name}`); }

const slotArg = getFlag('slot') ?? 'all';
const charArg = getFlag('char');
const force   = hasFlag('force');
const delayMs = Number(getFlag('delay') ?? '500');

const SLOTS = slotArg === 'all' ? ['main','evolution','icon'] as const : [slotArg as 'main'|'evolution'|'icon'];
const charFilter = charArg ? new Set(charArg.split(',').map(s => s.trim()).filter(Boolean)) : null;

interface Summary {
  character: string;
  pinyin: string;
  meaning: string;
  position: number;
  isDone: boolean;
  hasImages: { main: boolean; evolution: boolean; icon: boolean };
}

async function main() {
  console.log(`▶ batch-generate against ${API}`);
  console.log(`  slots: ${SLOTS.join(', ')}`);
  if (charFilter) console.log(`  chars: ${[...charFilter].join(', ')}`);
  if (force) console.log(`  --force: re-generating existing images`);

  const drafts: Summary[] = await (await fetch(`${API}/api/drafts`)).json();
  const targets = drafts.filter(d => !charFilter || charFilter.has(d.character));

  let attempts = 0, ok = 0, skipped = 0, failed = 0;
  const t0 = Date.now();

  for (const d of targets) {
    for (const slot of SLOTS) {
      attempts++;
      if (!force && d.hasImages[slot]) {
        console.log(`  ⏭  ${d.character} (${d.pinyin}, ${d.meaning}) — ${slot}: уже uploaded`);
        skipped++;
        continue;
      }
      process.stdout.write(`  🤖 ${d.character} (${d.pinyin}, ${d.meaning}) — ${slot}: `);
      const t1 = Date.now();
      try {
        const res = await fetch(
          `${API}/api/drafts/${encodeURIComponent(d.character)}/generate-image/${slot}`,
          { method: 'POST' }
        );
        const j: any = await res.json();
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        console.log(`✓ ${(j.size / 1024).toFixed(0)} KB in ${Date.now() - t1}ms`);
        ok++;
      } catch (e: any) {
        console.log(`✗ ${e.message}`);
        failed++;
      }
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    }
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ done — ${ok} generated, ${skipped} skipped, ${failed} failed (${attempts} attempts in ${dt}s)`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
