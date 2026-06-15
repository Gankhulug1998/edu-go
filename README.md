# Edu Go

Хятад иероглифын сургалтын карт автомат үүсгэгч — Монгол хэлээр тайлбарлана. 30 бэлэн ханз, AI-аар зураг generate хийх боломжтой.

> An API-driven Chinese-character learning card generator for Mongolian learners. Ships with 30 pedagogically-ordered drafts and an OpenAI image-generation pipeline.

![preview](docs/preview.png)

## Features

- **30 ханз бэлэн эх бэлтгэл** — 林, 森, 明, 休, 好, 安, 家... etymology-based mnemonics in Mongolian
- **Satori + resvg PNG render pipeline** — ~400ms/карт (1400×1050)
- **PostgreSQL database** — drafts, uploaded images, render history (JSONB + BYTEA)
- **OpenAI gpt-image-1 integration** — per-slot AI generation
- **Web studio** at `/` — sidebar, prompt editor, upload, preview, Ctrl+Enter generate

## Stack

- **Node.js 22+** runtime
- **TypeScript** via `tsx`
- **Hono** HTTP server (`@hono/node-server`)
- **Satori** (JSX → SVG) + **@resvg/resvg-js** (SVG → PNG) + **sharp** (post-processing)
- **PostgreSQL** (node-postgres) for persistence
- **OpenAI gpt-image-1** for image generation
- **Inter** (Latin + Cyrillic) + **Source Han Sans/Serif CN** for typography

## Quick start

```bash
# 1) Install
npm install

# 2) Download fonts (one-time)
npm run fonts

# 3) Optional: AI image generation
export OPENAI_API_KEY=sk-...

# 4) Run server
npm run dev
# → UI:  http://localhost:3000/
# → API: http://localhost:3000/api
```

Startup auto-creates the schema and seeds Postgres from `public/drafts.json`.
DB connection: `DATABASE_URL` env (default: local unix socket `postgres:///edugo?host=/var/run/postgresql` — run `createdb edugo` once).
Migrating from the old SQLite file: `npx tsx scripts/migrate-sqlite-to-pg.ts [data/edugo.db]`.

## Workflow

1. Open `http://localhost:3000/` — left sidebar shows all 30 ханз
2. Click a draft — form populates from DB
3. For each image slot:
   - **🤖 AI generate** — uses the prompt stored on the draft (~15-30s)
   - **🖼 Upload** — drag-drop your own image
   - **📋 Copy** the prompt and run it elsewhere (Midjourney, etc.)
4. Edit anything (story, parts, prompts) — auto-saves to DB (500ms debounce)
5. **▶ Generate** (or Ctrl+Enter) — renders card, stores in `renders` table, marks draft as ✓ done
6. **⬇ Download** — PNG/SVG/WebP/JPEG
7. **←/→** keyboard nav between drafts

## API reference

All endpoints under `http://localhost:3000`.

### DB-backed (recommended)
| Method | Path | Description |
|---|---|---|
| `GET`    | `/api/drafts`                                       | List 30 drafts (summary + done/image flags) |
| `GET`    | `/api/drafts/:character`                            | Full draft with prompts |
| `PATCH`  | `/api/drafts/:character`                            | Deep-merge update (auto-save target) |
| `POST`   | `/api/drafts/:character/reset`                      | Revert to seed + clear uploaded images |
| `PUT`    | `/api/drafts/:character/images/:slot`               | Multipart upload (`file=...`) |
| `POST`   | `/api/drafts/:character/generate-image/:slot`       | AI-generate using stored prompt |
| `DELETE` | `/api/drafts/:character/images/:slot`               | Remove uploaded image |
| `GET`    | `/api/images/:character/:slot`                      | Image binary (use as `<img src>`) |
| `POST`   | `/api/drafts/:character/render?format=png\|svg\|webp\|jpeg\|base64` | Render + persist |
| `GET`    | `/api/drafts/:character/renders`                    | Render history |
| `GET`    | `/api/renders/:id`                                  | Past render binary |
| `POST`   | `/api/admin/reseed`                                 | Force-import `public/drafts.json` |

### Standalone (no DB)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/generate` | JSON body → render binary (see `examples/lin.json`) |
| `POST` | `/api/upload`   | Ad-hoc file → `{ dataUrl }` |

### Slot kinds (in CardData JSON)

```ts
type ImageSlot =
  | { kind: 'url';     url: string }
  | { kind: 'base64';  data: string; mime?: 'image/png' | 'image/jpeg' | 'image/webp' }
  | { kind: 'prompt';  prompt: string; size?: '1024x1024' | '1024x1536' | '1536x1024' }
  | { kind: 'auto' }                  // system builds prompt from character + meaning
  | { kind: 'emoji';   emoji: string } // fetched from Twemoji CDN
```

## Batch AI generation

For Codex / scripted use:

```bash
# All slots for all 30 drafts (~$4.20)
npm run batch:ai -- --slot all

# Only main scenes (~$1.20)
npm run batch:ai -- --slot main

# Specific characters
npm run batch:ai -- --char 林,森,明 --slot all

# Force re-generate (overwrite existing uploads)
npm run batch:ai -- --slot main --force

# Different server
API=http://other-host:3000 npm run batch:ai
```

**Cost estimate** (gpt-image-1):
- main (1024×1024): ~$0.04/image × 30 = **$1.20**
- evolution (1536×1024): ~$0.06/image × 30 = **$1.80**
- icon (1024×1024): ~$0.04/image × 30 = **$1.20**
- **Total for 90 images: ~$4.20**

## Architecture

```
public/                         # static frontend + seed data
  index.html                    # Tailwind CDN + vanilla JS studio
  drafts.json                   # 30 cards + 90 prompts (canonical seed)
src/
  server.ts                     # Hono routes (DB + standalone APIs)
  db.ts                         # PostgreSQL layer (drafts/images/renders)
  render.tsx                    # satori → resvg → PNG pipeline
  template.tsx                  # 8-block Satori JSX layout
  images.ts                     # OpenAI client + auto-prompts + emoji resolver
  fonts.ts                      # Inter + Source Han loader
  icons.ts                      # inline SVG (book/speaker/star/...)
  types.ts                      # CardData + ImageSlot
data/edugo.db                 # legacy SQLite (kept for migrate-sqlite-to-pg.ts)
assets/fonts/                   # downloaded by `npm run fonts` (gitignored)
scripts/
  download-fonts.sh             # Inter + Source Han Sans/Serif CN
  test-render.ts                # standalone CLI: JSON → PNG
  batch-generate.ts             # batch AI generation across drafts
examples/
  lin.json / lin-noai.json      # standalone-render fixtures
```

### Database schema (auto-applied on startup)

```sql
drafts  ( character PK, position, data JSON, is_done, updated_at )
images  ( character, slot CHECK in ('main','evolution','icon'),
          mime, data BLOB, size, uploaded_at, PK(character,slot) )
renders ( id AUTO, character, format, data BLOB, size, rendered_at )
```

`FOREIGN KEY` + `CASCADE DELETE` so resetting a draft cleans its images.
WAL mode for concurrent reads. Re-seeding is non-destructive (uses `INSERT ... ON CONFLICT DO UPDATE`).

## Keyboard shortcuts

| Key | Action |
|---|---|
| `←` / `→` | Previous / next draft |
| `Ctrl + Enter` | Generate current card |

## Licenses & attribution

Card content (Mongolian stories, meanings, examples) is original to this project. Third-party data and assets it builds on:

| Source | Used for | License | Requirement |
|---|---|---|---|
| [Twemoji](https://github.com/twitter/twemoji) | emoji icons rendered into cards | CC-BY 4.0 | **attribution required** wherever cards are published — credit "Twemoji © Twitter, Inc. and other contributors, CC-BY 4.0" |
| [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cedict) | pinyin reference (build-time) | CC BY-SA 4.0 | attribution |
| [makemeahanzi](https://github.com/skishore/makemeahanzi) `dictionary.txt` | decomposition reference (build-time) | LGPL-3.0+ | attribution; don't redistribute the file itself under other terms |
| [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) | HSK word lists (build-time) | MIT | attribution in source |
| Inter, Source Han Sans/Serif, LXGW WenKai | fonts in rendered cards | SIL OFL 1.1 | no attribution needed; keep license files if redistributing fonts |

Rules for content and image generation:

- **Never reference studios, artists, brands, or franchises in image prompts** (e.g. "Studio Ghibli style", "Disney style"). Describe the aesthetic generically instead: "soft watercolor children's storybook illustration style, warm pastel palette".
- AI-generated images (gpt-image-1): outputs are ours per OpenAI terms, but only if prompts stay free of third-party IP.
- When the public learner app ships, add a credits page listing the table above (Twemoji attribution is mandatory, the rest is good practice).

## Notes

- The 30 default characters are visually-decomposable compounds (林=木+木, 好=女+子, 家=宀+豕, etc.) — prompts emphasize the composition so images become memorable mnemonics, not generic art.
- Variable fonts (Inter variable TTF) break Satori's bundled `opentype.js` parser; the project ships static-instance WOFFs per subset (`cyrillic`, `cyrillic-ext`, `latin`, `latin-ext`) for Inter.
- Mongolian Ү (`U+04AE`) lives in `cyrillic-ext`, not the basic `cyrillic` subset — both files load.
- The header pill defaults to `"Edu Go"`; override per-card via `data.title`.
