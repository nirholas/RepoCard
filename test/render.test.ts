/**
 * Renders real cards with the production engine (Node build of Satori + resvg)
 * and checks the output is a valid 1280x640 PNG under GitHub's 1 MB limit.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { satori } from '@cf-wasm/satori/node';
import { describe, expect, it } from 'vitest';
import { fallbackDesigns } from '../src/design/fallback';
import { BACKGROUNDS, FONTS, LAYOUTS, type DesignSpec } from '../src/design/types';
import { RenderEngine } from '../src/render/engine';
import { FONT_MANIFEST } from '../src/render/fonts';
import { repoFixture } from './fixtures';

const require = createRequire(import.meta.url);
const root = join(__dirname, '..');

const engine = new RenderEngine({
  satori: satori as never,
  resvg: readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')),
  fonts: FONT_MANIFEST.map((f) => {
    const b = readFileSync(join(root, 'src/render/font-files', f.file));
    return { name: f.name, weight: f.weight, style: f.style, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer };
  }),
  // No network in tests: emoji and non-Latin fallbacks resolve to nothing.
  fetcher: (async () => new Response('', { status: 404 })) as unknown as typeof fetch,
});

const repo = repoFixture();
const cardRepo = { owner: repo.owner, name: repo.name, stars: repo.stars, forks: repo.forks, language: repo.language, license: repo.license };
const base = fallbackDesigns(repo).concepts[0]!;

function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function render(spec: DesignSpec) {
  return engine.png({ spec, repo: cardRepo, avatar: null, options: { showStats: true, showOwner: true } });
}

describe('render engine', () => {
  it.each(LAYOUTS.flatMap((layout) => (['midnight', 'paper'] as const).map((palette) => [layout, palette] as const)))(
    'renders %s / %s as a valid PNG',
    async (layout, palette) => {
      const png = await render({ ...base, layout, palette });
      expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(pngSize(png)).toEqual({ width: 1280, height: 640 });
      expect(png.byteLength).toBeLessThan(1_000_000);
    },
  );

  it('renders every background and font', async () => {
    for (const background of BACKGROUNDS) await render({ ...base, background });
    for (const font of FONTS) await render({ ...base, font });
  });

  it('handles long titles, monograms, no chips, and hidden stats', async () => {
    const long = { ...base, title: 'an-extremely-long-repository-name-for-layout-tests', mark: 'monogram' as const, chips: [] };
    for (const layout of LAYOUTS) await render({ ...long, layout });
    const svg = await engine.svg({ spec: base, repo: cardRepo, avatar: null, options: { showStats: false, showOwner: false } });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('widget-kit</'); // text is converted to paths
  });
});
