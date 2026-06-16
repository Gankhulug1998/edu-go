import { Draft } from './api';

export type QType = 'meaning' | 'character' | 'pinyin';
export type QuizQuestion = {
  type: QType;
  char: string;          // source character (to mark progress)
  question: string;      // the prompt label (Mongolian)
  promptMain: string;    // big text shown (character or meaning)
  promptHan: boolean;    // is promptMain a hanzi?
  promptSub?: string;    // small hint under prompt
  answer: string;
  options: string[];     // 4 options incl. the answer
  optionHan: boolean;    // are options hanzi (character quiz)?
};

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
const uniq = (arr: string[]) => Array.from(new Set(arr));

export function buildQuiz(pool: Draft[], count = 10): QuizQuestion[] {
  const valid = pool.filter((d) => d.meaning && d.pinyin && d.character);
  if (valid.length < 4) return [];
  const picks = shuffle(valid).slice(0, Math.min(count, valid.length));
  const types: QType[] = ['meaning', 'character', 'pinyin'];

  return picks.map((d) => {
    const type = types[Math.floor(Math.random() * types.length)];
    const others = shuffle(valid.filter((x) => x.character !== d.character));

    if (type === 'meaning') {
      const distract = uniq(others.map((x) => x.meaning)).filter((m) => m !== d.meaning).slice(0, 3);
      return {
        type, char: d.character, question: 'Энэ ханз ямар утгатай вэ?',
        promptMain: d.character, promptHan: true, promptSub: d.pinyin,
        answer: d.meaning, options: shuffle([d.meaning, ...distract]), optionHan: false,
      };
    }
    if (type === 'character') {
      const distract = uniq(others.map((x) => x.character)).filter((c) => c !== d.character).slice(0, 3);
      return {
        type, char: d.character, question: 'Аль ханз энэ утгатай вэ?',
        promptMain: d.meaning, promptHan: false, promptSub: d.pinyin,
        answer: d.character, options: shuffle([d.character, ...distract]), optionHan: true,
      };
    }
    // pinyin
    const distract = uniq(others.map((x) => x.pinyin)).filter((p) => p !== d.pinyin).slice(0, 3);
    return {
      type, char: d.character, question: 'Энэ ханзны пиньин аль нь вэ?',
      promptMain: d.character, promptHan: true, promptSub: d.meaning,
      answer: d.pinyin, options: shuffle([d.pinyin, ...distract]), optionHan: false,
    };
  });
}

export function scoreMessage(pct: number): string {
  if (pct >= 90) return 'Гайхалтай! 🎉';
  if (pct >= 70) return 'Сайн байна! 👏';
  if (pct >= 50) return 'Дажгүй — үргэлжлүүл!';
  return 'Дахин оролдоё 💪';
}
