import { alpha, ensureContrast, mix } from '../design/color';
import type { DesignSpec, Palette, RenderOptions } from '../design/types';
import type { FontRoles } from './fonts';
import { div, h, type SatoriElement, type Style } from './h';
import { languageColor } from './languages';

export const WIDTH = 1280;
export const HEIGHT = 640;

/** The subset of repository data a card displays. */
export interface CardRepo {
  owner: string;
  name: string;
  stars: number;
  forks: number;
  language: string | null;
  license: string | null;
}

export interface CardContext {
  spec: DesignSpec;
  palette: Palette;
  fonts: FontRoles;
  repo: CardRepo;
  /** Owner avatar as a data: URI, or null when unavailable. */
  avatar: string | null;
  options: RenderOptions;
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/**
 * Pick a font size that fits `text` in `maxWidth` on one line, or on up to
 * two lines when one line would fall below `minSize`.
 */
export function fitTitle(
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  ratio: number,
): { size: number; lines: 1 | 2 } {
  const len = Math.max(1, [...text].length);
  const oneLine = maxWidth / (len * ratio);
  if (oneLine >= minSize) return { size: Math.floor(Math.min(maxSize, oneLine)), lines: 1 };
  const twoLines = (maxWidth * 2 * 0.9) / (len * ratio);
  return { size: Math.floor(Math.max(minSize * 0.8, Math.min(maxSize, twoLines))), lines: 2 };
}

/** Allow long identifiers like "my-really_long.package" to wrap at separators. */
export function breakable(title: string): string {
  return title.replace(/([-_./])(?=\S)/g, '$1\u200b');
}

export function monogram(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s\-_.]+/)
    .filter(Boolean);
  const letters = words.length >= 2 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** The project mark: avatar, emoji, or monogram tile. Returns null for "none". */
export function mark(ctx: CardContext, size: number, opts: { radius?: number; ring?: boolean } = {}): SatoriElement | null {
  const p = ctx.palette;
  const radius = opts.radius ?? size / 2;
  const kind = ctx.spec.mark === 'avatar' && !ctx.avatar ? 'monogram' : ctx.spec.mark;
  const ring: Style = opts.ring
    ? { border: `${Math.max(3, size * 0.035)}px solid ${alpha(p.fg, 0.9)}`, boxShadow: `0 0 0 ${Math.round(size * 0.09)}px ${alpha(p.accent, 0.22)}` }
    : {};

  if (kind === 'none') return null;
  if (kind === 'avatar' && ctx.avatar) {
    return h('img', { src: ctx.avatar, width: size, height: size, style: { width: size, height: size, borderRadius: radius, ...ring } });
  }
  if (kind === 'emoji' && ctx.spec.emoji) {
    return div(
      {
        width: size,
        height: size,
        borderRadius: radius,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: alpha(p.accent, p.mode === 'dark' ? 0.16 : 0.12),
        fontSize: size * 0.58,
        ...ring,
      },
      ctx.spec.emoji,
    );
  }
  const text = ensureContrast('#ffffff', mix(p.accent, p.accent2, 0.5), 3) === '#ffffff' ? '#ffffff' : p.bg;
  return div(
    {
      width: size,
      height: size,
      borderRadius: radius,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundImage: `linear-gradient(135deg, ${p.accent} 0%, ${p.accent2} 100%)`,
      color: text,
      fontFamily: ctx.fonts.display,
      fontWeight: ctx.fonts.displayWeight,
      fontSize: size * 0.4,
      letterSpacing: '-0.02em',
      ...ring,
    },
    monogram(ctx.spec.title || ctx.repo.name),
  );
}

const ICONS = {
  star: 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z',
  fork: 'M7 3a2.5 2.5 0 0 1 1 4.79V9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7.79a2.5 2.5 0 1 1 2 0V9a3 3 0 0 1-3 3h-2v4.21a2.5 2.5 0 1 1-2 0V12H9a3 3 0 0 1-3-3V7.79A2.5 2.5 0 0 1 7 3z',
  scale:
    'M12 3a1 1 0 0 1 1 1v1.1l5.4 1.2a1 1 0 0 1 .6.5l2.9 6.2A1 1 0 0 1 22 13.5a4 4 0 0 1-8 0 1 1 0 0 1 .1-.5L16.6 7.8 13 7v12h4a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h4V7l-3.6.8L9.9 13a1 1 0 0 1 .1.5 4 4 0 0 1-8 0 1 1 0 0 1 .1-.5L5 6.8a1 1 0 0 1 .6-.5L11 5.1V4a1 1 0 0 1 1-1zM6 9.4L4.2 13.1a2 2 0 0 0 3.6 0zm12 0l-1.8 3.7a2 2 0 0 0 3.6 0z',
} as const;

export function icon(name: keyof typeof ICONS, size: number, color: string): SatoriElement {
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24' }, h('path', { d: ICONS[name], fill: color }));
}

export interface StatsStyle {
  size: number;
  color: string;
  iconColor?: string;
  font: string;
  gap?: number;
}

/** Stars, forks, language and license. Hidden items are omitted, never shown as zero. */
export function stats(ctx: CardContext, s: StatsStyle): SatoriElement | null {
  if (!ctx.options.showStats) return null;
  const r = ctx.repo;
  const iconSize = Math.round(s.size * 1.1);
  const iconColor = s.iconColor ?? s.color;
  const item = (...children: (SatoriElement | string)[]) =>
    div({ alignItems: 'center', gap: Math.round(s.size * 0.4) }, ...children);
  const text = (t: string) => div({ fontFamily: s.font, fontSize: s.size, color: s.color, fontWeight: 500 }, t);

  const items: SatoriElement[] = [];
  if (r.stars > 0) items.push(item(icon('star', iconSize, iconColor), text(formatCount(r.stars))));
  if (r.forks > 0) items.push(item(icon('fork', iconSize, iconColor), text(formatCount(r.forks))));
  if (r.language) {
    items.push(
      item(
        div({ width: s.size * 0.7, height: s.size * 0.7, borderRadius: s.size, backgroundColor: languageColor(r.language), border: `2px solid ${alpha(ctx.palette.fg, 0.25)}` }),
        text(r.language),
      ),
    );
  }
  if (r.license) items.push(item(icon('scale', iconSize, iconColor), text(r.license)));
  if (!items.length) return null;
  return div({ alignItems: 'center', gap: s.gap ?? Math.round(s.size * 1.5) }, ...items);
}

export type ChipVariant = 'soft' | 'outline' | 'solid' | 'hash' | 'flag';

export function chips(ctx: CardContext, variant: ChipVariant, size = 22): SatoriElement | null {
  const list = ctx.spec.chips;
  if (!list.length) return null;
  const p = ctx.palette;
  const font = variant === 'flag' ? ctx.fonts.mono : ctx.fonts.body;
  const chip = (label: string) => {
    switch (variant) {
      case 'solid':
        return div(
          { padding: `${size * 0.4}px ${size * 0.85}px`, borderRadius: 999, backgroundColor: p.accent, color: ensureContrast(p.bg, p.accent, 4.5), fontFamily: font, fontSize: size, fontWeight: 700 },
          label,
        );
      case 'outline':
        return div(
          { padding: `${size * 0.35}px ${size * 0.8}px`, borderRadius: 999, border: `2px solid ${alpha(p.fg, 0.22)}`, color: p.fg, fontFamily: font, fontSize: size, fontWeight: 500 },
          label,
        );
      case 'hash':
        return div({ color: p.muted, fontFamily: font, fontSize: size, fontWeight: 500 }, `#${label.replace(/\s+/g, '-')}`);
      case 'flag':
        return div({ color: p.accent2 === p.accent ? p.accent : ensureContrast(p.accent2, p.bg, 3), fontFamily: font, fontSize: size }, `--${label.replace(/\s+/g, '-')}`);
      case 'soft':
      default:
        return div(
          {
            padding: `${size * 0.38}px ${size * 0.8}px`,
            borderRadius: 999,
            backgroundColor: alpha(p.accent, p.mode === 'dark' ? 0.16 : 0.12),
            border: `1.5px solid ${alpha(p.accent, 0.35)}`,
            color: ensureContrast(p.accent, mix(p.bg, p.accent, 0.14), 4.5),
            fontFamily: font,
            fontSize: size,
            fontWeight: 600,
          },
          label,
        );
    }
  };
  return div({ gap: variant === 'hash' || variant === 'flag' ? size : size * 0.55, flexWrap: 'wrap' }, ...list.map(chip));
}
