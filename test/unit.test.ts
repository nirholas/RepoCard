import { describe, expect, it } from 'vitest';
import { contrast, ensureContrast, isHex, mix } from '../src/design/color';
import { conciseTagline, fallbackDesigns } from '../src/design/fallback';
import { PALETTES } from '../src/design/palettes';
import { PALETTE_NAMES, LAYOUTS } from '../src/design/types';
import { cleanEmoji, cleanText, resolvePalette, sanitizeSpec } from '../src/design/validate';
import { readmeToText } from '../src/lib/github';
import { fnv1a } from '../src/lib/hash';
import { formatRepoRef, parseRepoRef } from '../src/lib/repo-ref';
import { breakable, fitTitle, formatCount, monogram } from '../src/render/components';
import { emojiCode, notoFamily } from '../src/render/engine';
import { repoFixture } from './fixtures';

describe('parseRepoRef', () => {
  it.each([
    ['vercel/next.js', 'vercel/next.js'],
    ['https://github.com/vercel/next.js', 'vercel/next.js'],
    ['http://www.github.com/vercel/next.js/', 'vercel/next.js'],
    ['github.com/vercel/next.js/tree/canary/packages', 'vercel/next.js'],
    ['https://github.com/vercel/next.js?tab=readme#install', 'vercel/next.js'],
    ['git@github.com:vercel/next.js.git', 'vercel/next.js'],
    ['https://github.com/vercel/next.js.git', 'vercel/next.js'],
    ['gh repo clone cli/cli', 'cli/cli'],
    ['  nirholas/three.ws  ', 'nirholas/three.ws'],
  ])('parses %s', (input, expected) => {
    const ref = parseRepoRef(input);
    expect(ref && formatRepoRef(ref)).toBe(expected);
  });

  it.each(['', 'vercel', 'https://gitlab.com/a/b', '-bad/repo', 'bad--owner/repo', 'owner/..', 'a/b c', 'x'.repeat(400)])(
    'rejects %j',
    (input) => {
      expect(parseRepoRef(input)).toBeNull();
    },
  );
});

describe('color', () => {
  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('ensureContrast keeps passing colors and fixes failing ones', () => {
    expect(ensureContrast('#ffffff', '#000000', 7)).toBe('#ffffff');
    const fixed = ensureContrast('#222222', '#111111', 4.5);
    expect(contrast(fixed, '#111111')).toBeGreaterThanOrEqual(4.5);
  });

  it('validates hex', () => {
    expect(isHex('#abc')).toBe(true);
    expect(isHex('#a1b2c3')).toBe(true);
    expect(isHex('red')).toBe(false);
    expect(isHex('#12345')).toBe(false);
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('palettes', () => {
  it.each(PALETTE_NAMES)('%s meets contrast floors', (name) => {
    const p = PALETTES[name];
    expect(contrast(p.fg, p.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(p.muted, p.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.accent, p.bg)).toBeGreaterThanOrEqual(3);
  });

  it('adjusts an illegible brand accent', () => {
    const p = resolvePalette({ palette: 'snow', accent: '#fafafa' });
    expect(contrast(p.accent, p.bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('sanitizeSpec', () => {
  const base = fallbackDesigns(repoFixture()).concepts[0]!;

  it('replaces unknown enum values with the base', () => {
    const spec = sanitizeSpec({ layout: 'hologram', palette: 'neon', font: 'comic', background: 'lava', mark: 'logo' }, base);
    expect(spec.layout).toBe(base.layout);
    expect(spec.palette).toBe(base.palette);
    expect(spec.font).toBe(base.font);
    expect(spec.background).toBe(base.background);
    expect(spec.mark).toBe(base.mark);
  });

  it('clamps text and strips control and bidi characters', () => {
    const spec = sanitizeSpec({ title: 'a\u202eb\u0000c', tagline: 'word '.repeat(60), chips: ['ONE', 'one', 'two', 'three', 'four'] }, base);
    expect(spec.title).toBe('a b c');
    expect(spec.tagline.length).toBeLessThanOrEqual(110);
    expect(spec.tagline.endsWith('…')).toBe(true);
    expect(spec.chips).toEqual(['one', 'two', 'three']);
  });

  it('only accepts a single emoji and hex accents', () => {
    expect(sanitizeSpec({ mark: 'emoji', emoji: 'not emoji' }, { ...base, mark: 'avatar' }).mark).toBe('avatar');
    expect(sanitizeSpec({ mark: 'emoji', emoji: '🚀' }, base).emoji).toBe('🚀');
    expect(sanitizeSpec({ accent: 'javascript:alert(1)' }, base).accent).toBeUndefined();
    expect(sanitizeSpec({ accent: '#7C3AED' }, base).accent).toBe('#7c3aed');
  });

  it('handles non-object input', () => {
    expect(sanitizeSpec(null, base)).toMatchObject({ layout: base.layout, palette: base.palette, title: base.title, tagline: base.tagline });
    expect(sanitizeSpec('nope', base).layout).toBe(base.layout);
  });

  it('cleanText and cleanEmoji edge cases', () => {
    expect(cleanText(42, 10)).toBe('');
    expect(cleanText('  a   b  ', 10)).toBe('a b');
    expect(cleanEmoji('👩‍💻')).toBe('👩‍💻');
    expect(cleanEmoji('🚀🚀')).toBeUndefined();
  });
});

describe('fallbackDesigns', () => {
  it('is deterministic and returns 4 distinct layouts with light and dark palettes', () => {
    const a = fallbackDesigns(repoFixture());
    const b = fallbackDesigns(repoFixture());
    expect(a.concepts).toEqual(b.concepts);
    expect(a.concepts).toHaveLength(4);
    expect(new Set(a.concepts.map((c) => c.layout)).size).toBe(4);
    const modes = new Set(a.concepts.map((c) => PALETTES[c.palette].mode));
    expect(modes).toEqual(new Set(['light', 'dark']));
    for (const c of a.concepts) expect(LAYOUTS).toContain(c.layout);
  });

  it('varies across repositories', () => {
    const names = ['a/one', 'b/two', 'c/three', 'd/four', 'e/five'];
    const firsts = names.map((n) => fallbackDesigns(repoFixture({ fullName: n })).concepts[0]!.layout);
    expect(new Set(firsts).size).toBeGreaterThan(1);
  });

  it('writes concise taglines', () => {
    expect(conciseTagline('Give your AI agent a 3D body: rigged GLB avatars from text or a photo, an LLM brain, a Solana wallet, a one-tag embed.')).toBe(
      'Give your AI agent a 3D body',
    );
    expect(conciseTagline('😎 Awesome lists about all kinds of interesting topics [NOTE: Pull requests are welcome]')).toBe(
      'Awesome lists about all kinds of interesting topics',
    );
    expect(conciseTagline('The React Framework')).toBe('The React Framework');
  });

  it('falls back to README or a generic line when there is no description', () => {
    expect(fallbackDesigns(repoFixture({ description: '' })).concepts[0]!.tagline).toMatch(/Composable widgets/);
    expect(fallbackDesigns(repoFixture({ description: '', readme: '' })).concepts[0]!.tagline).toBe('A TypeScript project by octo.');
  });
});

describe('render helpers', () => {
  it('formats counts', () => {
    expect([0, 999, 1000, 1234, 9999, 12_345, 999_499, 1_500_000].map(formatCount)).toEqual(['0', '999', '1k', '1.2k', '10k', '12k', '999k', '1.5M']);
  });

  it('fits titles', () => {
    expect(fitTitle('next.js', 1100, 120, 56, 0.6)).toEqual({ size: 120, lines: 1 });
    const long = fitTitle('an-extremely-long-repository-name-for-testing', 1100, 120, 56, 0.6);
    expect(long.lines).toBe(2);
    expect(long.size).toBeGreaterThanOrEqual(44);
  });

  it('makes identifiers breakable and builds monograms', () => {
    expect(breakable('a-b_c.d')).toBe('a-\u200bb_\u200bc.\u200bd');
    expect(monogram('next.js')).toBe('NJ');
    expect(monogram('RepoCard')).toBe('RC');
    expect(monogram('x')).toBe('X');
  });

  it('maps emoji to twemoji file names', () => {
    expect(emojiCode('🚀')).toBe('1f680');
    expect(emojiCode('❤️')).toBe('2764');
    expect(emojiCode('👩‍💻')).toBe('1f469-200d-1f4bb');
  });

  it('picks Noto families by script', () => {
    expect(notoFamily('unknown', '你好')).toBe('Noto Sans SC');
    expect(notoFamily('unknown', 'こんにちは')).toBe('Noto Sans JP');
    expect(notoFamily('unknown', '한국어')).toBe('Noto Sans KR');
    expect(notoFamily('ar-AR', 'مرحبا')).toBe('Noto Sans Arabic');
    expect(notoFamily('unknown', 'Привет')).toBe('Noto Sans');
  });
});

describe('misc', () => {
  it('readmeToText strips markup', () => {
    const text = readmeToText('# Title\n\n[![CI](https://x/badge.svg)](https://x)\n<img src="a.png">\n```js\ncode()\n```\nSee [docs](https://d) and `api`.');
    expect(text).toContain('Title');
    expect(text).toContain('See docs and api.');
    expect(text).not.toMatch(/badge|code\(\)|<img|https/);
  });

  it('fnv1a is stable', () => {
    expect(fnv1a('repocard')).toBe(fnv1a('repocard'));
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
  });
});
