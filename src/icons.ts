/**
 * Inline SVG icons → base64 data-URL.
 * Satori-д шууд <img src={...}> хэлбэрээр оруулна.
 */

function dataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function strokeIcon(paths: string, color = '#FFFFFF', strokeWidth = 2.2): string {
  return dataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" ` +
      `fill="none" stroke="${color}" stroke-width="${strokeWidth}" ` +
      `stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  );
}

function filledIcon(paths: string, color = '#FFFFFF'): string {
  return dataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" ` +
      `fill="${color}">${paths}</svg>`
  );
}

export const icons = {
  /** Open book — header & жишээ үг хэсэг */
  book: (c = '#FFFFFF') =>
    strokeIcon(
      `<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>` +
        `<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>`,
      c
    ),

  /** Speaker / sound — дуудлага */
  speaker: (c = '#2D52E3') =>
    strokeIcon(
      `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="${c}"/>` +
        `<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>` +
        `<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`,
      c
    ),

  /** Lightbulb — санааны түүх */
  lightbulb: (c = '#FFFFFF') =>
    strokeIcon(
      `<path d="M9 18h6"/>` +
        `<path d="M10 22h4"/>` +
        `<path d="M2 9a8 8 0 1 1 14 5.29c-.5.62-1 1.5-1 2.21V18h-6v-1.5c0-.71-.5-1.59-1-2.21A8 8 0 0 1 2 9z"/>`,
      c
    ),

  /** Star (filled) — mnemonic bar */
  star: (c = '#FFFFFF') =>
    filledIcon(
      `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`,
      c
    ),

  /** Right arrow — structure & evolution */
  arrowRight: (c = '#2D52E3') =>
    strokeIcon(
      `<line x1="4" y1="12" x2="20" y2="12"/>` + `<polyline points="13 5 20 12 13 19"/>`,
      c,
      2.5
    ),

  /** Plus sign */
  plus: (c = '#2D52E3') =>
    strokeIcon(
      `<line x1="5" y1="12" x2="19" y2="12"/>` + `<line x1="12" y1="5" x2="12" y2="19"/>`,
      c,
      2.5
    ),

  /** Generic two-pine-trees fallback icon — meaning placeholder */
  trees: (c = '#1F8B4C') =>
    filledIcon(
      `<path d="M7 3 L3 11 L5 11 L2 17 L4.5 17 L4.5 21 L9.5 21 L9.5 17 L12 17 L9 11 L11 11 Z"/>` +
        `<path d="M16 5 L12 13 L14 13 L11 19 L13.5 19 L13.5 21 L18.5 21 L18.5 19 L21 19 L18 13 L20 13 Z"/>`,
      c
    ),
};
