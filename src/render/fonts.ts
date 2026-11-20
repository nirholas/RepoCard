import type { FontPair } from '../design/types';

export interface FontFace {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 700 | 800;
  style: 'normal' | 'italic';
}

/** Bundled font files (see scripts/sync-fonts.mjs), by family, weight and style. */
export const FONT_MANIFEST = [
  { file: 'inter-latin-400-normal.woff', name: 'Inter', weight: 400, style: 'normal' },
  { file: 'inter-latin-500-normal.woff', name: 'Inter', weight: 500, style: 'normal' },
  { file: 'inter-latin-700-normal.woff', name: 'Inter', weight: 700, style: 'normal' },
  { file: 'inter-latin-800-normal.woff', name: 'Inter', weight: 800, style: 'normal' },
  { file: 'space-grotesk-latin-700-normal.woff', name: 'Space Grotesk', weight: 700, style: 'normal' },
  { file: 'jetbrains-mono-latin-400-normal.woff', name: 'JetBrains Mono', weight: 400, style: 'normal' },
  { file: 'jetbrains-mono-latin-700-normal.woff', name: 'JetBrains Mono', weight: 700, style: 'normal' },
  { file: 'instrument-serif-latin-400-normal.woff', name: 'Instrument Serif', weight: 400, style: 'normal' },
  { file: 'instrument-serif-latin-400-italic.woff', name: 'Instrument Serif', weight: 400, style: 'italic' },
  { file: 'sora-latin-700-normal.woff', name: 'Sora', weight: 700, style: 'normal' },
  { file: 'bricolage-grotesque-latin-800-normal.woff', name: 'Bricolage Grotesque', weight: 800, style: 'normal' },
] as const satisfies readonly (Omit<FontFace, 'data'> & { file: string })[];

export interface FontRoles {
  display: string;
  displayWeight: number;
  /** Average glyph advance as a fraction of font size, used to fit titles. */
  displayRatio: number;
  displayTracking: number;
  body: string;
  bodyWeight: number;
  mono: string;
}

const BODY = { body: 'Inter', bodyWeight: 400, mono: 'JetBrains Mono' } as const;

export const FONT_ROLES: Record<FontPair, FontRoles> = {
  modern: { display: 'Inter', displayWeight: 800, displayRatio: 0.6, displayTracking: -0.035, ...BODY },
  geometric: { display: 'Space Grotesk', displayWeight: 700, displayRatio: 0.58, displayTracking: -0.03, ...BODY },
  technical: {
    display: 'JetBrains Mono',
    displayWeight: 700,
    displayRatio: 0.6,
    displayTracking: -0.02,
    body: 'JetBrains Mono',
    bodyWeight: 400,
    mono: 'JetBrains Mono',
  },
  editorial: { display: 'Instrument Serif', displayWeight: 400, displayRatio: 0.44, displayTracking: -0.02, ...BODY },
  friendly: { display: 'Sora', displayWeight: 700, displayRatio: 0.64, displayTracking: -0.035, ...BODY },
  expressive: { display: 'Bricolage Grotesque', displayWeight: 800, displayRatio: 0.56, displayTracking: -0.04, ...BODY },
};
