/** Зургийн нэг slot — 5 янзаар өгөгдөж болно. */
export type ImageSlot =
  | { kind: 'url';     url: string }                                         // public URL
  | { kind: 'base64';  data: string; mime?: 'image/png' | 'image/jpeg' | 'image/webp' }
  | { kind: 'prompt';  prompt: string; size?: '1024x1024' | '1024x1536' | '1536x1024' }
  | { kind: 'auto' }                                                          // системээс prompt автомат
  | { kind: 'emoji';   emoji: string };                                       // зөвхөн meaning icon-д тохиромжтой

export interface CardData {
  /** Толгойн нэр, default: "ХЯТАД ИЕРОГЛИФЫН СУРГАЛТ" */
  title?: string;

  /** Гол иероглиф, ж: "林" */
  character: string;

  /**
   * Картын төрөл:
   * - 'compound' (default): A+B=C задаргаатай (林 = 木+木).
   * - 'simple': задрахгүй үндсэн дүрс (象形, ж: 人 日 山) — A+B=C мөр харуулахгүй.
   */
  kind?: 'compound' | 'simple';

  /** Пиньин, ж: "lín" */
  pinyin: string;

  /** Утга монгол, ж: "ой" */
  meaning: string;

  /**
   * Бүтэц: 2-3 хэсэг → үр дүн. ж: 木 + 木 = 林.
   * kind='simple' үед parts хоосон байж болно (template зөвхөн үр дүнг харуулна).
   */
  structure: {
    parts: Array<{ char: string; label: string }>;
    result: { char: string; label: string };
  };

  /** Санааны түүх (тайлбар текст) */
  story: string;

  /**
   * Заавал биш: бүтэц картын 2-р мөрөнд харуулах эмоди томьёо.
   * Ж: "☀️ + 🌙 = 💡" → 明-ийн утгыг визуалаар бэхжүүлнэ.
   */
  storyFormula?: string;

  /** Жишээ үг */
  example: {
    word: string;       // ж: "森林"
    pinyin: string;     // ж: "sēnlín"
    translation: string; // ж: "ой мод"
  };

  /** Тогтоох арга (доод бар) */
  mnemonic?: {
    parts: string[];   // ж: ["木","木"]
    result: string;    // ж: "林"
    meaning: string;   // ж: "ой"
  };

  /** Зурагнууд — бүгд optional, өгөөгүй бол auto */
  images?: {
    main?:      ImageSlot;  // том баруун-дээд зураг (forest scene)
    evolution?: ImageSlot;  // санааны түүх дотор тренд (1 мод → 2 мод)
    icon?:     ImageSlot;  // утгын дүрс (ногоон тойрог дотор)
  };

  /**
   * AI зургийг үүсгэхэд санал болгох prompt-ууд.
   * Хэрэглэгч UI-аас copy хийгээд өөрийн дуртай AI үүсгэгчид өгнө.
   * Render pipeline-д ажиллахгүй — зөвхөн copy-output зориулалттай.
   */
  prompts?: {
    main?: string;
    evolution?: string;
    icon?: string;
  };

  // ─── Систем: түвшин / ангилал / шошго (багц зохион байгуулахад) ───

  /** Сурах түвшин: 1 = Анхан, 2 = Дунд, 3 = Гүнзгий */
  level?: CardLevel;

  /** Утгын ангилал (нэг карт = нэг үндсэн ангилал) */
  category?: CardCategory;

  /**
   * Нэмэлт шошго — багц/шүүлтэд. Ж: "triple" (森众炎晶品 шиг X+X+X),
   * "radical:水" (氵 гэр бүл), "hsk1" гэх мэт.
   */
  tags?: string[];
}

/** Сурах түвшин */
export type CardLevel = 1 | 2 | 3;

/** Утгын ангилал — slug. Монгол нэрс packs.json дотор. */
export type CardCategory =
  | 'baigal'  // Байгаль
  | 'amitan'  // Амьтан
  | 'xun'     // Хүн ба гэр бүл
  | 'biye'    // Бие ба эрхтэн
  | 'uil'     // Үйл хөдлөл
  | 'setgel'  // Сэтгэл ба бодол
  | 'chanar'  // Шинж чанар
  | 'ongo'    // Өнгө
  | 'too'     // Тоо ба хэмжих
  | 'tsag'    // Цаг хугацаа
  | 'oron'    // Орон зай ба чиглэл
  | 'gazar'   // Газар ба барилга
  | 'ediin'   // Эд хэрэглэл ба тээвэр
  | 'xel'     // Хэл зүй ба туслах үг
  | 'xool';   // Хоол ундаа

/** Сурах багц (курацлагдсан, эрэмбэтэй ханзны цуглуулга) */
export interface Pack {
  /** slug, ж: "people-basics" */
  id: string;
  /** Монгол гарчиг, ж: "Хүн ба гэр бүл" */
  title: string;
  /** Богино тайлбар */
  description: string;
  /** Үндсэн түвшин */
  level: CardLevel;
  /** Үндсэн ангилал */
  category: CardCategory;
  /** Эмоди дүрс (UI-д) */
  icon?: string;
  /** Багц доторх ханзнууд — сурах эрэмбээр */
  characters: string[];
}

/** Түвшин/ангилал/багцын манифест (public/packs.json) */
export interface PackManifest {
  levels: Array<{ id: CardLevel; slug: string; name: string; description: string }>;
  categories: Array<{ slug: CardCategory; name: string; icon: string }>;
  packs: Pack[];
}
