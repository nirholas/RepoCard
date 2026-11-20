import { mix } from '../design/color';
import type { Background, Palette } from '../design/types';
import { HEIGHT, WIDTH } from './components';

/**
 * Card backgrounds as native SVG. Satori renders CSS gradients through
 * <pattern> fills, which resvg rasterizes 4-5x slower than native gradients
 * and paths, so backgrounds are drawn here and injected beneath Satori's
 * output (see injectBackground).
 */
export function backgroundSvg(kind: Background, p: Palette): string {
  const dark = p.mode === 'dark';
  const rect = (fill: string, extra = '') => `<rect width="${WIDTH}" height="${HEIGHT}" fill="${fill}"${extra}/>`;
  const radial = (id: string, cx: number, cy: number, r: number, color: string, opacity: number) =>
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
  const vignette = `<radialGradient id="rc-v" cx="${WIDTH / 2}" cy="${HEIGHT * 0.45}" r="${WIDTH * 0.62}" gradientUnits="userSpaceOnUse"><stop offset="0.45" stop-color="${p.bg}" stop-opacity="0"/><stop offset="1" stop-color="${p.bg}" stop-opacity="0.95"/></radialGradient>`;
  const line = dark ? 0.07 : 0.08;

  let defs = '';
  let body = rect(p.bg);

  switch (kind) {
    case 'aurora':
      defs =
        radial('rc-a', WIDTH * 0.12, HEIGHT * 0.18, WIDTH * 0.62, p.accent, dark ? 0.42 : 0.26) +
        radial('rc-b', WIDTH * 0.88, HEIGHT * 0.9, WIDTH * 0.6, p.accent2, dark ? 0.38 : 0.24) +
        radial('rc-c', WIDTH * 0.78, HEIGHT * 0.05, WIDTH * 0.48, p.bg2, 0.95);
      body += rect('url(#rc-c)') + rect('url(#rc-a)') + rect('url(#rc-b)');
      break;

    case 'grid': {
      let d = '';
      for (let x = 0; x <= WIDTH; x += 48) d += `M${x} 0V${HEIGHT}`;
      for (let y = 16; y <= HEIGHT; y += 48) d += `M0 ${y}H${WIDTH}`;
      defs = vignette + radial('rc-a', WIDTH * 0.85, HEIGHT * 0.15, WIDTH * 0.45, p.accent, dark ? 0.22 : 0.14);
      body += `<path d="${d}" stroke="${p.fg}" stroke-opacity="${line}" stroke-width="1"/>` + rect('url(#rc-v)') + rect('url(#rc-a)');
      break;
    }

    case 'dots': {
      let d = '';
      const r = 1.7;
      for (let x = 16; x < WIDTH; x += 32) for (let y = 16; y < HEIGHT; y += 32) d += `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0-${r * 2} 0`;
      defs = vignette;
      body += `<path d="${d}" fill="${p.fg}" fill-opacity="${dark ? 0.17 : 0.2}"/>` + rect('url(#rc-v)');
      break;
    }

    case 'diagonal': {
      let d = '';
      for (let x = -HEIGHT; x < WIDTH; x += 26) d += `M${x} ${HEIGHT}L${x + HEIGHT} 0`;
      defs = `<linearGradient id="rc-f" x1="0" y1="0" x2="${WIDTH}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${p.bg}" stop-opacity="1"/><stop offset="0.45" stop-color="${p.bg}" stop-opacity="0.85"/><stop offset="1" stop-color="${p.bg}" stop-opacity="0.15"/></linearGradient>`;
      body += `<path d="${d}" stroke="${p.accent}" stroke-opacity="${dark ? 0.1 : 0.12}" stroke-width="2"/>` + rect('url(#rc-f)');
      break;
    }

    case 'rings': {
      const cx = WIDTH * 0.86;
      const cy = HEIGHT * 0.5;
      defs = radial('rc-a', cx, cy, WIDTH * 0.4, p.accent, dark ? 0.2 : 0.13);
      body += rect('url(#rc-a)');
      [180, 320, 470, 630, 800].forEach((r, i) => {
        body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${i % 2 ? p.accent2 : p.accent}" stroke-opacity="${(0.24 - i * 0.04).toFixed(2)}" stroke-width="2"/>`;
      });
      break;
    }

    case 'solid':
    default:
      defs = `<linearGradient id="rc-s" x1="0" y1="0" x2="${WIDTH * 0.35}" y2="${HEIGHT}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${p.bg}"/><stop offset="1" stop-color="${mix(p.bg, p.bg2, 0.6)}"/></linearGradient>`;
      body = rect('url(#rc-s)');
      break;
  }

  return `<defs>${defs}</defs><g>${body}</g>`;
}

/** Insert background markup directly after the root <svg ...> tag of Satori's output. */
export function injectBackground(svg: string, background: string): string {
  const end = svg.indexOf('>');
  if (!svg.startsWith('<svg') || end < 0) throw new Error('Unexpected SVG output');
  return svg.slice(0, end + 1) + background + svg.slice(end + 1);
}
