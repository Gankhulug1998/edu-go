import { useEffect, useState } from 'react';
import { api, Draft, Pack } from './api';

let _drafts: Draft[] | null = null;
let _packs: Pack | null = null;

export function useCatalog() {
  const [drafts, setDrafts] = useState<Draft[]>(_drafts ?? []);
  const [packs, setPacks] = useState<Pack | null>(_packs);
  const [loading, setLoading] = useState(!_drafts);

  useEffect(() => {
    if (_drafts && _packs) return;
    let alive = true;
    (async () => {
      try {
        const [d, p] = await Promise.all([api.drafts(), api.packs()]);
        _drafts = d; _packs = p;
        if (alive) { setDrafts(d); setPacks(p); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { drafts, packs, loading };
}

export const LEVELS = [
  { id: 1, name: 'Анхан шат', tag: 'HSK 1', color: '#0E9F6E' },
  { id: 2, name: 'Дунд шат', tag: 'HSK 2', color: '#5B57D1' },
];

export function levelStats(drafts: Draft[], progress: Record<string, string>, level: number) {
  const all = drafts.filter((d) => d.level === level);
  const known = all.filter((d) => progress[d.character] === 'known').length;
  return { total: all.length, known, pct: all.length ? Math.round((known / all.length) * 100) : 0 };
}
