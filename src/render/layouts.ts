import { alpha, ensureContrast, mix } from '../design/color';
import type { Layout } from '../design/types';
import {
  HEIGHT,
  WIDTH,
  breakable,
  chips,
  fitTitle,
  mark,
  stats,
  type CardContext,
} from './components';
import { div, type SatoriElement, type Style } from './h';

const PAD = 80;

/** Keep chips whose combined length fits on one line. */
function fitChips(list: string[], maxChars: number): string[] {
  const out: string[] = [];
  let used = 0;
  for (const c of list) {
    if (used + c.length + 3 > maxChars) break;
    out.push(c);
    used += c.length + 3;
  }
  return out;
}

/** A soft elliptical glow, drawn natively; Satori's blurred box-shadows are far too slow to rasterize. */
function glowSvg(id: string, x: number, y: number, w: number, h: number, color: string, opacity: number): string {
  return `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><ellipse cx="${x + w / 2}" cy="${y + h / 2 + 30}" rx="${w * 0.8}" ry="${h * 0.72}" fill="url(#${id})"/>`;
}

function frame(ctx: CardContext, style: Style, ...children: (SatoriElement | null)[]): SatoriElement {
  // Transparent root: the background is native SVG injected by the engine.
  // No overflow:hidden: the canvas edge already clips, and Satori would wrap
  // every descendant in a mask, which makes rasterizing ~4x slower.
  // Absolute insets (not width/height) so padding stays inside the canvas.
  return div(
    { position: 'relative', width: WIDTH, height: HEIGHT, color: ctx.palette.fg, fontFamily: ctx.fonts.body },
    div({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...style }, ...children),
  );
}

function title(ctx: CardContext, maxWidth: number, maxSize: number, minSize: number, style: Style = {}): SatoriElement {
  const text = ctx.spec.title;
  const fit = fitTitle(text, maxWidth, maxSize, minSize, ctx.fonts.displayRatio);
  return div(
    {
      maxWidth,
      fontFamily: ctx.fonts.display,
      fontWeight: ctx.fonts.displayWeight,
      fontSize: fit.size,
      lineHeight: fit.lines === 1 ? 1.05 : 1.02,
      letterSpacing: `${ctx.fonts.displayTracking}em`,
      color: ctx.palette.fg,
      ...(fit.lines === 2 ? { lineClamp: 2 } : {}),
      ...style,
    },
    breakable(text),
  );
}

function tagline(ctx: CardContext, size: number, maxWidth: number, style: Style = {}): SatoriElement {
  return div(
    { maxWidth, fontSize: size, lineHeight: 1.35, color: ctx.palette.muted, fontFamily: ctx.fonts.body, fontWeight: ctx.fonts.bodyWeight, lineClamp: 2, ...style },
    ctx.spec.tagline,
  );
}

function owner(ctx: CardContext, size: number, style: Style = {}): SatoriElement | null {
  if (!ctx.options.showOwner) return null;
  return div({ fontSize: size, color: ctx.palette.muted, fontFamily: ctx.fonts.body, fontWeight: 500, ...style }, ctx.repo.owner);
}

/** Centered: mark, owner, title, tagline, chips; stats pinned to the bottom. */
function spotlight(ctx: CardContext): SatoriElement {
  const p = ctx.palette;
  const m = mark(ctx, 96, { ring: true });
  return frame(
    ctx,
    { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `48px ${PAD}px 100px` },
    m ? div({ marginBottom: 22 }, m) : null,
    owner(ctx, 24, { marginBottom: 4, letterSpacing: '0.01em' }),
    title(ctx, WIDTH - PAD * 2, 100, 56, { textAlign: 'center', justifyContent: 'center' }),
    tagline(ctx, 29, 940, { marginTop: 14, textAlign: 'center', justifyContent: 'center' }),
    ctx.spec.chips.length ? div({ marginTop: 24 }, chips(ctx, 'soft', 20)) : null,
    div(
      { position: 'absolute', left: 0, right: 0, bottom: 44, justifyContent: 'center' },
      stats(ctx, { size: 22, color: p.muted, iconColor: alpha(p.fg, 0.75), font: ctx.fonts.body }),
    ),
  );
}

/** Text column on the left, a gradient panel with a large mark on the right. */
function split(ctx: CardContext): SatoriElement {
  const p = ctx.palette;
  const panelW = 400;
  const panelH = 480;
  const small = mark(ctx, 44, { radius: ctx.spec.mark === 'avatar' ? 22 : 12 });
  const bigKind = ctx.spec.mark === 'none' ? 'monogram' : ctx.spec.mark;
  const big = mark({ ...ctx, spec: { ...ctx.spec, mark: bigKind } }, 196, { radius: bigKind === 'avatar' ? 98 : 44 });
  const onPanel = ensureContrast('#ffffff', mix(p.accent, p.accent2, 0.5), 3) === '#ffffff' ? '#ffffff' : '#0b0b0b';

  return frame(
    ctx,
    { padding: PAD, alignItems: 'center', justifyContent: 'space-between' },
    div(
      { flexDirection: 'column', width: WIDTH - PAD * 2 - panelW - 64, height: HEIGHT - PAD * 2, justifyContent: 'space-between' },
      div({ alignItems: 'center', gap: 16 }, ctx.spec.mark !== 'none' ? small : null, owner(ctx, 26)),
      div(
        { flexDirection: 'column' },
        title(ctx, WIDTH - PAD * 2 - panelW - 64, 92, 52),
        tagline(ctx, 28, WIDTH - PAD * 2 - panelW - 64, { marginTop: 18 }),
        ctx.spec.chips.length ? div({ marginTop: 26 }, chips(ctx, 'outline', 20)) : null,
      ),
      stats(ctx, { size: 22, color: p.muted, iconColor: p.accent, font: ctx.fonts.body }) ?? div({ height: 1 }),
    ),
    div(
      {
        position: 'relative',
        width: panelW,
        height: panelH,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: `linear-gradient(140deg, ${p.accent} 0%, ${p.accent2} 100%)`,
        overflow: 'hidden',
      },
      div({ position: 'absolute', left: -120, top: -120, width: 420, height: 420, borderRadius: 420, border: `2px solid ${alpha(onPanel, 0.25)}` }),
      div({ position: 'absolute', right: -160, bottom: -160, width: 460, height: 460, borderRadius: 460, border: `2px solid ${alpha(onPanel, 0.2)}` }),
      div({ position: 'absolute', right: -60, bottom: -60, width: 260, height: 260, borderRadius: 260, backgroundColor: alpha(onPanel, 0.1) }),
      big ? div({ borderRadius: bigKind === 'avatar' ? 120 : 52, padding: 10, backgroundColor: alpha(onPanel, 0.22) }, big) : null,
    ),
  );
}

/** Magazine typography: rules, a large serif title and an italic deck. */
function editorial(ctx: CardContext): SatoriElement {
  const p = ctx.palette;
  const rule = alpha(p.fg, 0.18);
  const meta = [ctx.repo.language, ctx.repo.license].filter(Boolean).join('  ·  ');
  const m = mark(ctx, 40, { radius: ctx.spec.mark === 'avatar' ? 20 : 10 });
  return frame(
    ctx,
    { flexDirection: 'column', padding: `64px ${PAD}px 56px`, justifyContent: 'space-between' },
    div(
      { alignItems: 'center', justifyContent: 'space-between', paddingBottom: 22, borderBottom: `1.5px solid ${rule}` },
      div(
        { alignItems: 'center', gap: 14 },
        m ?? div({ width: 14, height: 14, backgroundColor: p.accent }),
        ctx.options.showOwner
          ? div({ fontSize: 20, letterSpacing: '0.18em', fontWeight: 700, color: p.fg, fontFamily: 'Inter' }, ctx.repo.owner.toUpperCase())
          : null,
      ),
      meta ? div({ fontSize: 20, letterSpacing: '0.08em', color: p.muted, fontFamily: 'Inter', fontWeight: 500 }, meta.toUpperCase()) : null,
    ),
    div(
      { flexDirection: 'column' },
      title(ctx, WIDTH - PAD * 2, 150, 72, { fontFamily: 'Instrument Serif', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 0.98 }),
      div(
        { marginTop: 18, maxWidth: 1000, fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 38, lineHeight: 1.25, color: p.muted, lineClamp: 2 },
        ctx.spec.tagline,
      ),
    ),
    div(
      { alignItems: 'center', justifyContent: 'space-between', paddingTop: 22, borderTop: `1.5px solid ${rule}` },
      stats(ctx, { size: 21, color: p.fg, iconColor: p.accent, font: 'Inter' }) ?? div({ height: 1 }),
      chips(ctx, 'hash', 21),
    ),
  );
}

/** A terminal window with a clone command, the title and the tagline as a comment. */
function terminal(ctx: CardContext): SatoriElement {
  const p = ctx.palette;
  const mono = ctx.fonts.mono;
  const winW = 1100;
  const winH = 500;
  const dots = ['#ff5f57', '#febc2e', '#28c840'];
  const prompt = ensureContrast(p.accent, mix(p.bg, p.bg2, 0.7), 4.5);
  const fit = fitTitle(ctx.spec.title, winW - 150, 104, 46, 0.6);
  return frame(
    ctx,
    { alignItems: 'center', justifyContent: 'center' },
    div(
      {
        flexDirection: 'column',
        width: winW,
        height: winH,
        borderRadius: 22,
        backgroundColor: alpha(mix(p.bg, p.bg2, 0.7), 0.94),
        border: `1.5px solid ${alpha(p.fg, 0.14)}`,
        overflow: 'hidden',
      },
      div(
        { position: 'relative', height: 56, alignItems: 'center', paddingLeft: 24, borderBottom: `1.5px solid ${alpha(p.fg, 0.1)}`, backgroundColor: alpha(p.fg, 0.03) },
        div({ gap: 10 }, ...dots.map((c) => div({ width: 16, height: 16, borderRadius: 16, backgroundColor: c }))),
        div(
          { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: 18, color: p.muted },
          `${ctx.repo.owner}/${ctx.repo.name}`,
        ),
      ),
      div(
        { flexDirection: 'column', flexGrow: 1, padding: '40px 56px 36px', justifyContent: 'space-between' },
        div(
          { flexDirection: 'column' },
          div(
            { fontFamily: mono, fontSize: 22, color: p.muted, marginBottom: 22 },
            div({ color: prompt, marginRight: 14 }, '$'),
            `git clone github.com/${ctx.repo.owner}/${ctx.repo.name}`,
          ),
          div(
            { alignItems: 'flex-end', gap: 14 },
            div(
              { fontFamily: mono, fontWeight: 700, fontSize: fit.size, lineHeight: 1.05, letterSpacing: '-0.02em', color: p.fg, maxWidth: winW - 150, ...(fit.lines === 2 ? { lineClamp: 2 } : {}) },
              breakable(ctx.spec.title),
            ),
            div({ width: Math.round(fit.size * 0.5), height: Math.round(fit.size * 0.86), backgroundColor: p.accent, marginBottom: Math.round(fit.size * 0.1) }),
          ),
          div({ fontFamily: mono, fontSize: 24, lineHeight: 1.45, color: p.muted, marginTop: 20, maxWidth: winW - 112, lineClamp: 2 }, `# ${ctx.spec.tagline}`),
        ),
        div(
          { alignItems: 'center', justifyContent: 'space-between' },
          chips({ ...ctx, spec: { ...ctx.spec, chips: fitChips(ctx.spec.chips, 34) } }, 'flag', 20) ?? div({ height: 1 }),
          stats(ctx, { size: 20, color: p.muted, iconColor: prompt, font: mono, gap: 26 }),
        ),
      ),
    ),
  );
}

/** Huge display type with an accent bar and solid chips. */
function poster(ctx: CardContext): SatoriElement {
  const p = ctx.palette;
  const m = mark(ctx, 56, { radius: ctx.spec.mark === 'avatar' ? 28 : 16 });
  return frame(
    ctx,
    { flexDirection: 'column', padding: `64px ${PAD}px 64px`, justifyContent: 'space-between' },
    div(
      { alignItems: 'center', justifyContent: 'space-between' },
      div({ alignItems: 'center', gap: 16 }, m, owner(ctx, 26, { color: p.fg, fontWeight: 700 })),
      stats(ctx, { size: 22, color: p.fg, iconColor: p.accent, font: ctx.fonts.body }),
    ),
    div(
      { flexDirection: 'column' },
      div({ width: 120, height: 12, borderRadius: 6, backgroundImage: `linear-gradient(90deg, ${p.accent}, ${p.accent2})`, marginBottom: 26 }),
      title(ctx, WIDTH - PAD * 2, 180, 76, { letterSpacing: `${ctx.fonts.displayTracking * 1.3}em`, lineHeight: 0.95 }),
      tagline(ctx, 32, 1020, { marginTop: 22, color: mix(p.fg, p.muted, 0.45) }),
    ),
    chips(ctx, 'solid', 22) ?? div({ height: 1 }),
  );
}

/** Quiet and precise: an accent rail, left-aligned type and generous space. */
function minimal(ctx: CardContext): SatoriElement {
  const p = ctx.palette;
  const m = mark(ctx, 80, { radius: ctx.spec.mark === 'avatar' ? 40 : 22 });
  return frame(
    ctx,
    { flexDirection: 'column', padding: `${PAD}px ${PAD + 24}px`, justifyContent: 'space-between' },
    div({ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, backgroundImage: `linear-gradient(180deg, ${p.accent}, ${p.accent2})` }),
    div({ alignItems: 'center', gap: 20 }, m, owner(ctx, 26)),
    div(
      { flexDirection: 'column' },
      title(ctx, WIDTH - PAD * 2 - 48, 100, 56),
      tagline(ctx, 30, 980, { marginTop: 18 }),
    ),
    div(
      { alignItems: 'center', justifyContent: 'space-between' },
      stats(ctx, { size: 22, color: p.muted, iconColor: alpha(p.fg, 0.8), font: ctx.fonts.body }) ?? div({ height: 1 }),
      chips(ctx, 'soft', 20),
    ),
  );
}

export const LAYOUT_RENDERERS: Record<Layout, (ctx: CardContext) => SatoriElement> = {
  spotlight,
  split,
  editorial,
  terminal,
  poster,
  minimal,
};

/** Native SVG drawn between the background and the layout (shadows and glows). */
export const LAYOUT_DECOR: Partial<Record<Layout, (ctx: CardContext) => string>> = {
  split: (ctx) => glowSvg('rc-g', WIDTH - PAD - 400, (HEIGHT - 480) / 2, 400, 480, ctx.palette.accent, ctx.palette.mode === 'dark' ? 0.32 : 0.28),
  terminal: (ctx) => glowSvg('rc-g', 90, 70, 1100, 500, ctx.palette.mode === 'dark' ? '#000000' : ctx.palette.accent, ctx.palette.mode === 'dark' ? 0.5 : 0.14),
};
