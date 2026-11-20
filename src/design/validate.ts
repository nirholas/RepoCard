import { ensureContrast, isHex, normalizeHex } from './color';
import { PALETTES } from './palettes';
import {
  BACKGROUNDS,
  FONTS,
  LAYOUTS,
  MARKS,
  PALETTE_NAMES,
  type DesignSpec,
  type Palette,
} from './types';

export const LIMITS = {
  title: 48,
  tagline: 110,
  chip: 18,
  chips: 3,
  rationale: 200,
} as const;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Collapse whitespace, drop control characters, and clamp to `max` characters at a word boundary. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, '')}…`;
}

/** Accept exactly one emoji grapheme; anything else becomes undefined. */
export function cleanEmoji(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v || v.length > 16) return undefined;
  const segments = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(v)];
  if (segments.length !== 1) return undefined;
  return /\p{Extended_Pictographic}/u.test(v) ? v : undefined;
}

/**
 * Coerce untrusted model output (or query overrides) into a valid DesignSpec.
 * Unknown values fall back to `base`, so the result is always renderable.
 */
export function sanitizeSpec(input: unknown, base: DesignSpec): DesignSpec {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const chips = Array.isArray(o.chips)
    ? o.chips.map((c) => cleanText(c, LIMITS.chip).toLowerCase()).filter(Boolean)
    : base.chips;
  const mark = oneOf(o.mark, MARKS, base.mark);
  const emoji = cleanEmoji(o.emoji) ?? (mark === 'emoji' ? base.emoji : undefined);

  const spec: DesignSpec = {
    version: 1,
    layout: oneOf(o.layout, LAYOUTS, base.layout),
    background: oneOf(o.background, BACKGROUNDS, base.background),
    palette: oneOf(o.palette, PALETTE_NAMES, base.palette),
    font: oneOf(o.font, FONTS, base.font),
    mark: mark === 'emoji' && !emoji ? 'avatar' : mark,
    title: cleanText(o.title, LIMITS.title) || base.title,
    tagline: cleanText(o.tagline, LIMITS.tagline) || base.tagline,
    chips: [...new Set(chips)].slice(0, LIMITS.chips),
    rationale: cleanText(o.rationale, LIMITS.rationale) || base.rationale,
  };
  if (spec.mark === 'emoji' && emoji) spec.emoji = emoji;
  if (isHex(o.accent)) spec.accent = normalizeHex(o.accent);
  else if (base.accent && o.accent === undefined) spec.accent = base.accent;
  return spec;
}

/**
 * Resolve the palette for a spec, applying the optional brand accent and
 * enforcing contrast floors: text 7:1, secondary text 4.5:1, accent 3:1.
 */
export function resolvePalette(spec: Pick<DesignSpec, 'palette' | 'accent'>): Palette {
  const p = PALETTES[spec.palette] ?? PALETTES.midnight;
  const accent = spec.accent && isHex(spec.accent) ? spec.accent : p.accent;
  return {
    ...p,
    fg: ensureContrast(p.fg, p.bg, 7),
    muted: ensureContrast(p.muted, p.bg, 4.5),
    accent: ensureContrast(accent, p.bg, 3),
  };
}
