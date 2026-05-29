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

  /** Пиньин, ж: "lín" */
  pinyin: string;

  /** Утга монгол, ж: "ой" */
  meaning: string;

  /** Бүтэц: 2-3 хэсэг → үр дүн. ж: 木 + 木 = 林 */
  structure: {
    parts: Array<{ char: string; label: string }>;
    result: { char: string; label: string };
  };

  /** Санааны түүх (тайлбар текст) */
  story: string;

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
}
