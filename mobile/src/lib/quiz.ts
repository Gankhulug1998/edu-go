import { Draft, FullCard, SrsItem } from './api';

export type QMode = 'meaning' | 'character' | 'pinyin' | 'tone' | 'image' | 'cloze' | 'structure';

export type QuizQuestion = {
  mode: QMode;
  card: FullCard;          // full data of the target card (for elaborative feedback)
  question: string;        // prompt label (Mongolian)
  promptMain: string;      // big text (character / meaning / cloze / emoji)
  promptHan: boolean;
  promptSub?: string;      // hint under prompt
  promptParts?: { char: string; label: string }[]; // structure mode
  answer: string;
  options: string[];
  optionHan: boolean;
};

// ── pinyin tone helpers ──
const ACCENT_TONE: Record<string, number> = {
  'ā': 1, 'á': 2, 'ǎ': 3, 'à': 4, 'ē': 1, 'é': 2, 'ě': 3, 'è': 4, 'ī': 1, 'í': 2, 'ǐ': 3, 'ì': 4,
  'ō': 1, 'ó': 2, 'ǒ': 3, 'ò': 4, 'ū': 1, 'ú': 2, 'ǔ': 3, 'ù': 4, 'ǖ': 1, 'ǘ': 2, 'ǚ': 3, 'ǜ': 4,
};
const ACCENT_BASE: Record<string, string> = {
  'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e', 'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
  'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o', 'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'ü', 'ǘ': 'ü', 'ǚ': 'ü', 'ǜ': 'ü',
};
function toneOf(p: string): number { for (const ch of p) if (ACCENT_TONE[ch] != null) return ACCENT_TONE[ch]; return 0; }
function stripTones(p: string): string { return [...p].map((ch) => ACCENT_BASE[ch] ?? ch).join(''); }

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
const uniq = (a: string[]) => Array.from(new Set(a));

// ── SRS-ordered card selection: due → weak → new ──
export function selectCards(drafts: Draft[], srs: Record<string, SrsItem>, count: number, level?: number): Draft[] {
  const pool = (level ? drafts.filter((d) => d.level === level) : drafts).filter((d) => d.meaning && d.pinyin);
  const now = Date.now();
  const due: Draft[] = [], weak: Draft[] = [], fresh: Draft[] = [], rest: Draft[] = [];
  for (const d of pool) {
    const it = srs[d.character];
    if (!it) fresh.push(d);
    else if (it.dueAt != null && it.dueAt <= now) due.push(d);
    else if (it.lapses > 0 || it.box <= 1) weak.push(d);
    else rest.push(d); // learned & not yet due — fallback so a mastered scope still yields a quiz
  }
  due.sort((a, b) => (srs[a.character].dueAt ?? 0) - (srs[b.character].dueAt ?? 0));
  const ordered = [...due, ...shuffle(weak), ...fresh, ...shuffle(rest)]; // new in position order (HSK1 first)
  return ordered.slice(0, count);
}

// pick n unique distractor values from a field, preferring the same category
function distractors(catalog: Draft[], target: Draft | FullCard, field: 'meaning' | 'pinyin' | 'character', answer: string, n: number): string[] {
  const cat = (target as any).category;
  const same = shuffle(catalog.filter((d) => d.character !== target.character && d.category === cat));
  const rest = shuffle(catalog.filter((d) => d.character !== target.character && d.category !== cat));
  const pick = uniq([...same, ...rest].map((d) => d[field])).filter((v) => v && v !== answer);
  return pick.slice(0, n);
}

const TONE_LABEL = (t: number) => (t === 0 ? 'Хөнгөн аялгуу' : `${t}-р аялгуу`);

// ── build a mixed, interleaved question set from full card data ──
export function buildQuestions(full: FullCard[], catalog: Draft[]): QuizQuestion[] {
  const draftByChar: Record<string, Draft> = {};
  for (const d of catalog) draftByChar[d.character] = d;

  function modesFor(c: FullCard): QMode[] {
    const m: QMode[] = ['meaning', 'character', 'pinyin', 'tone'];
    if (c.images?.icon?.emoji) m.push('image');
    if (c.structure && c.structure.parts && c.structure.parts.length >= 2 && c.structure.result?.char) m.push('structure');
    if (c.example?.word && c.example.word.length > 1 && c.example.word.includes(c.character)) m.push('cloze');
    return m;
  }

  let prev: QMode | null = null;
  const out: QuizQuestion[] = [];
  for (const c of full) {
    const draft = draftByChar[c.character] || (c as unknown as Draft);
    const avail = modesFor(c);
    // interleave: avoid repeating the previous mode when possible
    let pool = avail.filter((m) => m !== prev);
    if (!pool.length) pool = avail;
    const mode = pool[Math.floor(Math.random() * pool.length)];
    prev = mode;
    out.push(makeQuestion(mode, c, draft, catalog));
  }
  return out;
}

function pad4(options: string[], answer: string, catalog: Draft[], field: 'meaning' | 'pinyin' | 'character'): string[] {
  let opts = uniq(options);
  if (opts.length < 4) {
    const extra = shuffle(catalog.map((d) => d[field])).filter((v) => v && !opts.includes(v));
    opts = uniq([...opts, ...extra]).slice(0, 4);
  }
  return shuffle(opts.slice(0, 4).includes(answer) ? opts.slice(0, 4) : [answer, ...opts.filter((o) => o !== answer)].slice(0, 4));
}

function makeQuestion(mode: QMode, c: FullCard, draft: Draft, catalog: Draft[]): QuizQuestion {
  const base = { card: c, mode } as const;
  switch (mode) {
    case 'meaning':
      return { ...base, question: 'Энэ ханз ямар утгатай вэ?', promptMain: c.character, promptHan: true, promptSub: c.pinyin,
        answer: c.meaning, options: pad4([c.meaning, ...distractors(catalog, draft, 'meaning', c.meaning, 3)], c.meaning, catalog, 'meaning'), optionHan: false };
    case 'character':
      return { ...base, question: 'Аль ханз энэ утгатай вэ?', promptMain: c.meaning, promptHan: false, promptSub: c.pinyin,
        answer: c.character, options: pad4([c.character, ...distractors(catalog, draft, 'character', c.character, 3)], c.character, catalog, 'character'), optionHan: true };
    case 'pinyin':
      return { ...base, question: 'Энэ ханзны пиньин аль нь вэ?', promptMain: c.character, promptHan: true, promptSub: c.meaning,
        answer: c.pinyin, options: pad4([c.pinyin, ...distractors(catalog, draft, 'pinyin', c.pinyin, 3)], c.pinyin, catalog, 'pinyin'), optionHan: false };
    case 'tone': {
      const t = toneOf(c.pinyin);
      let opts = uniq([TONE_LABEL(t), TONE_LABEL(1), TONE_LABEL(2), TONE_LABEL(3), TONE_LABEL(4)]).slice(0, 4);
      if (!opts.includes(TONE_LABEL(t))) opts = [TONE_LABEL(t), TONE_LABEL(1), TONE_LABEL(2), TONE_LABEL(3)];
      return { ...base, question: 'Энэ ханзны аялгуу аль нь вэ?', promptMain: c.character, promptHan: true, promptSub: stripTones(c.pinyin),
        answer: TONE_LABEL(t), options: shuffle(opts), optionHan: false };
    }
    case 'image':
      return { ...base, question: 'Энэ дүрс ямар ханз вэ?', promptMain: c.images?.icon?.emoji || '🀄', promptHan: false, promptSub: c.pinyin,
        answer: c.character, options: pad4([c.character, ...distractors(catalog, draft, 'character', c.character, 3)], c.character, catalog, 'character'), optionHan: true };
    case 'cloze': {
      const word = c.example!.word;
      const blanked = word.split(c.character).join('＿'); // replace ALL occurrences (e.g. 妈妈 → ＿＿) — never leak the answer
      return { ...base, question: 'Дутуу ханзыг нөх:', promptMain: blanked, promptHan: true, promptSub: c.example!.translation,
        answer: c.character, options: pad4([c.character, ...distractors(catalog, draft, 'character', c.character, 3)], c.character, catalog, 'character'), optionHan: true };
    }
    case 'structure': {
      const res = c.structure!.result.char;
      return { ...base, question: 'Эдгээр хэсгээс ямар ханз болох вэ?', promptMain: '', promptHan: true, promptParts: c.structure!.parts,
        answer: res, options: pad4([res, ...distractors(catalog, draft, 'character', res, 3)], res, catalog, 'character'), optionHan: true };
    }
  }
}

export function scoreMessage(pct: number): string {
  if (pct >= 90) return 'Гайхалтай! 🎉';
  if (pct >= 70) return 'Сайн байна! 👏';
  if (pct >= 50) return 'Дажгүй — үргэлжлүүл!';
  return 'Дахин оролдоё 💪';
}
