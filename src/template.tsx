import { icons } from './icons.js';
import type { CardData } from './types.js';

/** Зургийн URL-ууд (data URL эсвэл http). render.ts-аас дамжуулна. */
export interface ResolvedImages {
  main?: string;
  evolution?: string;
  icon?: string;
}

const C = {
  bg: '#EEF4FD',
  card: '#FFFFFF',
  border: '#DCE6F4',
  primary: '#2A4DD4',
  primaryDark: '#1A3FBD',
  primarySoft: '#E8EFFB',
  green: '#1F8B4C',
  greenSoft: '#E0EFE5',
  textDark: '#0E1F4F',
  textMid: '#324880',
  textMuted: '#6B81A8',
} as const;

// Layout: 1400×1050 (≈4:3)
export const CARD_WIDTH = 1400;
export const CARD_HEIGHT = 1050;

export function Card({ data, images = {} }: { data: CardData; images?: ResolvedImages }) {
  const title = data.title ?? 'Kanji.mn';
  const mnemonic = data.mnemonic ?? {
    parts: data.structure.parts.map((p) => p.char),
    result: data.structure.result.char,
    meaning: data.structure.result.label,
  };

  return (
    <div
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: C.bg,
        padding: 32,
        fontFamily: 'Inter, NotoSC',
        color: C.textDark,
      }}
    >
      {/* ───── HEADER ───── */}
      <div style={{ display: 'flex', marginBottom: 22 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            backgroundColor: C.primary,
            color: '#FFFFFF',
            padding: '16px 38px',
            borderRadius: 999,
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: 0.4,
          }}
        >
          <img src={icons.book('#FFFFFF')} width={38} height={38} />
          <span>{title}</span>
        </div>
      </div>

      {/* ───── MAIN ROW ───── */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 22 }}>
        {/* LEFT: character + structure + pronunciation/meaning */}
        <div style={{ display: 'flex', flexDirection: 'column', width: 760, gap: 22 }}>
          {/* Big character + structure card */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 28,
              height: 320,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontFamily: 'NotoSerif, NotoSC',
                fontSize: 260,
                lineHeight: 1,
                color: C.textDark,
                width: 280,
                height: 280,
                justifyContent: 'center',
                alignItems: 'center',
                fontWeight: 700,
              }}
            >
              {data.character}
            </div>
            <StructureCard parts={data.structure.parts} result={data.structure.result} />
          </div>

          {/* Pronunciation + meaning row */}
          <PronunciationRow pinyin={data.pinyin} meaning={data.meaning} iconImage={images.icon} />
        </div>

        {/* RIGHT: main illustration */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            height: 480,
            borderRadius: 24,
            overflow: 'hidden',
            border: `2px solid ${C.border}`,
            backgroundColor: '#DDE9F5',
          }}
        >
          {images.main ? (
            <img src={images.main} width="100%" height="100%" style={{ objectFit: 'cover' }} />
          ) : (
            <Placeholder label="Гол зураг (auto)" />
          )}
        </div>
      </div>

      {/* ───── BOTTOM ROW ───── */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 22, marginTop: 22, height: 260 }}>
        <StoryCard
          story={data.story}
          evolutionImage={images.evolution}
          firstPart={data.structure.parts[0]?.char ?? ''}
          result={data.structure.result.char}
        />
        <ExampleCard example={data.example} />
      </div>

      {/* ───── MNEMONIC BAR ───── */}
      <div style={{ display: 'flex', marginTop: 22 }}>
        <MnemonicBar parts={mnemonic.parts} result={mnemonic.result} meaning={mnemonic.meaning} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STRUCTURE CARD: БҮТЭЦ — parts + result with labels
// ────────────────────────────────────────────────────────────────────────────
function StructureCard({
  parts,
  result,
}: {
  parts: CardData['structure']['parts'];
  result: CardData['structure']['result'];
}) {
  const nodes: any[] = [];
  parts.forEach((p, i) => {
    nodes.push(<PartGlyph key={`p${i}`} char={p.char} label={p.label} />);
    if (i < parts.length - 1) {
      nodes.push(<Operator key={`op${i}`} symbol="+" />);
    }
  });
  nodes.push(<Operator key="eq" symbol="=" />);
  nodes.push(<PartGlyph key="res" char={result.char} label={result.label} />);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: C.primarySoft,
        border: `2px solid ${C.border}`,
        borderRadius: 22,
        padding: '20px 28px',
        gap: 14,
        flex: 1,
        minHeight: 260,
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          color: C.primary,
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: 1.2,
        }}
      >
        БҮТЭЦ
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 14,
        }}
      >
        {nodes}
      </div>
    </div>
  );
}

function PartGlyph({ char, label }: { char: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <span style={{ fontFamily: 'NotoSC', fontSize: 74, color: C.textDark, fontWeight: 700, lineHeight: 1 }}>
        {char}
      </span>
      <div
        style={{
          display: 'flex',
          fontSize: 16,
          color: C.primary,
          padding: '4px 14px',
          borderRadius: 999,
          border: `1.5px solid ${C.primary}`,
          backgroundColor: '#FFFFFF',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Operator({ symbol }: { symbol: '+' | '=' }) {
  return (
    <div
      style={{
        display: 'flex',
        color: C.primary,
        fontSize: 44,
        fontWeight: 400,
        paddingBottom: 32,
      }}
    >
      {symbol}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PRONUNCIATION + MEANING ROW
// ────────────────────────────────────────────────────────────────────────────
function PronunciationRow({
  pinyin,
  meaning,
  iconImage,
}: {
  pinyin: string;
  meaning: string;
  iconImage?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        backgroundColor: C.card,
        border: `2px solid ${C.border}`,
        borderRadius: 22,
        padding: '20px 28px',
        alignItems: 'center',
        gap: 24,
        height: 130,
      }}
    >
      <CircleIcon bg={C.primarySoft} src={icons.speaker(C.primary)} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 44, fontWeight: 700, color: C.primary, lineHeight: 1.1 }}>{pinyin}</span>
        <span style={{ fontSize: 16, color: C.textMuted, letterSpacing: 1.2, marginTop: 4 }}>ДУУДЛАГА</span>
      </div>

      <div style={{ display: 'flex', width: 2, height: 70, backgroundColor: C.border, marginLeft: 14, marginRight: 14 }} />

      {iconImage ? (
        <div
          style={{
            display: 'flex',
            width: 72,
            height: 72,
            borderRadius: 999,
            backgroundColor: C.greenSoft,
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          <img src={iconImage} width={56} height={56} style={{ objectFit: 'contain' }} />
        </div>
      ) : (
        <CircleIcon bg={C.greenSoft} src={icons.trees(C.green)} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 44, fontWeight: 700, color: C.green, lineHeight: 1.1 }}>{meaning}</span>
        <span style={{ fontSize: 16, color: C.textMuted, letterSpacing: 1.2, marginTop: 4 }}>УТГА</span>
      </div>
    </div>
  );
}

function CircleIcon({ bg, src, size = 72 }: { bg: string; src: string; size?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: bg,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <img src={src} width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STORY CARD: САНААНЫ ТҮҮХ
// ────────────────────────────────────────────────────────────────────────────
function StoryCard({
  story,
  evolutionImage,
  firstPart,
  result,
}: {
  story: string;
  evolutionImage?: string;
  firstPart: string;
  result: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: C.card,
        border: `2px solid ${C.border}`,
        borderRadius: 22,
        padding: 22,
        gap: 16,
        flex: 1,
      }}
    >
      <SectionHeader color={C.primary} bgIcon={C.primary} iconSrc={icons.lightbulb('#FFFFFF')} title="САНААНЫ ТҮҮХ" />
      <div style={{ display: 'flex', flexDirection: 'row', gap: 18, alignItems: 'center', flex: 1 }}>
        {/* Evolution illustration (AI generated) */}
        <div
          style={{
            display: 'flex',
            width: 200,
            height: 140,
            borderRadius: 14,
            backgroundColor: '#F4F8FE',
            overflow: 'hidden',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {evolutionImage ? (
            <img src={evolutionImage} width="100%" height="100%" style={{ objectFit: 'contain' }} />
          ) : (
            <EvolutionFallback firstPart={firstPart} result={result} />
          )}
        </div>
        <div
          style={{
            display: 'flex',
            flex: 1,
            fontSize: 22,
            lineHeight: 1.45,
            color: C.textMid,
          }}
        >
          {story}
        </div>
      </div>
    </div>
  );
}

function EvolutionFallback({ firstPart, result }: { firstPart: string; result: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <span style={{ fontFamily: 'NotoSC', fontSize: 44, fontWeight: 700, color: C.green }}>{firstPart}</span>
      <img src={icons.arrowRight(C.primary)} width={28} height={28} />
      <span style={{ fontFamily: 'NotoSC', fontSize: 44, fontWeight: 700, color: C.green }}>{result}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// EXAMPLE CARD: ЖИШЭЭ ҮГ
// ────────────────────────────────────────────────────────────────────────────
function ExampleCard({ example }: { example: CardData['example'] }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: C.greenSoft,
        border: `2px solid ${C.border}`,
        borderRadius: 22,
        padding: 22,
        gap: 16,
        flex: 1,
      }}
    >
      <SectionHeader color={C.green} bgIcon={C.green} iconSrc={icons.book('#FFFFFF')} title="ЖИШЭЭ ҮГ" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <span style={{ fontFamily: 'NotoSC', fontSize: 78, fontWeight: 700, color: C.textDark, lineHeight: 1 }}>
            {example.word}
          </span>
          <span style={{ fontSize: 38, color: C.textMid, fontWeight: 400 }}>= {example.translation}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <span style={{ fontSize: 28, color: C.green, fontWeight: 400, fontStyle: 'italic' }}>{example.pinyin}</span>
          <img src={icons.speaker(C.green)} width={26} height={26} />
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION HEADER (reusable: lightbulb/book + title)
// ────────────────────────────────────────────────────────────────────────────
function SectionHeader({
  color,
  bgIcon,
  iconSrc,
  title,
}: {
  color: string;
  bgIcon: string;
  iconSrc: string;
  title: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            width: 38,
            height: 38,
            borderRadius: 999,
            backgroundColor: bgIcon,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <img src={iconSrc} width={22} height={22} />
        </div>
        <span style={{ color, fontWeight: 700, fontSize: 22, letterSpacing: 1.2 }}>{title}</span>
      </div>
      <div
        style={{
          display: 'flex',
          height: 2,
          borderTop: `2px dashed ${color}`,
          opacity: 0.4,
          marginLeft: 52,
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MNEMONIC BAR: bottom band
// ────────────────────────────────────────────────────────────────────────────
function MnemonicBar({ parts, result, meaning }: { parts: string[]; result: string; meaning: string }) {
  const tokens: any[] = [];
  parts.forEach((p, i) => {
    tokens.push(
      <span key={`mp${i}`} style={{ fontFamily: 'NotoSC', fontSize: 36, fontWeight: 700, color: C.primaryDark }}>
        {p}
      </span>
    );
    if (i < parts.length - 1) {
      tokens.push(
        <span key={`mop${i}`} style={{ color: C.primary, fontSize: 32 }}>
          +
        </span>
      );
    }
  });
  tokens.push(
    <span key="marrow" style={{ display: 'flex', alignItems: 'center' }}>
      <img src={icons.arrowRight(C.primary)} width={28} height={28} />
    </span>
  );
  tokens.push(
    <span key="mres" style={{ fontFamily: 'NotoSC', fontSize: 36, fontWeight: 700, color: C.primaryDark }}>
      {result}
    </span>
  );
  tokens.push(
    <span key="meq" style={{ color: C.primary, fontSize: 32 }}>
      =
    </span>
  );
  tokens.push(
    <span key="mmean" style={{ color: C.green, fontSize: 28, fontWeight: 700 }}>
      {meaning}
    </span>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.primarySoft,
        border: `2px solid ${C.border}`,
        borderRadius: 22,
        padding: '18px 32px',
        width: '100%',
        gap: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          width: 44,
          height: 44,
          borderRadius: 999,
          backgroundColor: C.primary,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <img src={icons.star('#FFFFFF')} width={26} height={26} />
      </div>
      <span style={{ color: C.primary, fontWeight: 700, fontSize: 22, letterSpacing: 1 }}>
        САНАЖ АВАХ ХАМГИЙН ХЯЛБАР АРГА:
      </span>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 6 }}>
        {tokens}
      </div>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        color: C.textMuted,
        fontSize: 22,
      }}
    >
      {label}
    </div>
  );
}
