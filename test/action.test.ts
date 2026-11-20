import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { END, START, bannerBlock, upsertBanner } from '../action/readme-banner.mjs';
// @ts-expect-error plain browser script without types
import zip from '../public/assets/zip.js';

describe('readme banner', () => {
  it('inserts a banner at the top once and replaces it on later runs', () => {
    const once = upsertBanner('# Project\n\nHello', '.github/social-preview.png', 'octo/repo');
    expect(once.startsWith(START)).toBe(true);
    expect(once).toContain('<img src=".github/social-preview.png" alt="octo/repo"');
    const twice = upsertBanner(once, '.github/new.png', 'octo/repo');
    expect(twice.split(START)).toHaveLength(2);
    expect(twice).toContain('.github/new.png');
    expect(twice).toContain('# Project\n\nHello');
  });

  it('strips characters that would break the HTML', () => {
    expect(bannerBlock('./a.png', '<script>"x"</script>')).toContain('alt="scriptx/script"');
    expect(bannerBlock('./a.png', 'x').endsWith(END)).toBe(true);
  });
});

describe('zip writer', () => {
  it('computes CRC-32 and writes a valid archive layout', async () => {
    expect(zip.crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const blob = zip.createZip([
      { name: 'a.txt', data: new TextEncoder().encode('hello') },
      { name: 'b.png', data: new Uint8Array([1, 2, 3]) },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const eocd = bytes.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
    const cdOffset = view.getUint32(eocd + 16, true);
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50);
  });
});
