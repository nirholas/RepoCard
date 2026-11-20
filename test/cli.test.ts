import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyCards, previewStatus, type ApplyTarget } from '../packages/cli/src/apply';

const ref = (repo: string) => ({ owner: 'octo', repo });

function graphql(data: Record<string, unknown>) {
  return vi.fn(async () => Response.json({ data }));
}

afterEach(() => vi.unstubAllGlobals());

describe('previewStatus', () => {
  it('reads custom-preview and admin status in one GraphQL query', async () => {
    const fetchMock = graphql({
      r0: { usesCustomOpenGraphImage: true, openGraphImageUrl: 'https://img/a', viewerPermission: 'ADMIN' },
      r1: { usesCustomOpenGraphImage: false, openGraphImageUrl: 'https://img/b', viewerPermission: 'READ' },
    });
    vi.stubGlobal('fetch', fetchMock);
    const status = await previewStatus([ref('a'), ref('b')], 'token');
    expect(status.get('octo/a')).toEqual({ custom: true, admin: true, imageUrl: 'https://img/a' });
    expect(status.get('octo/b')).toEqual({ custom: false, admin: false, imageUrl: 'https://img/b' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.query).toContain('repository(owner: "octo", name: "a")');
  });
});

describe('applyCards (dry run)', () => {
  it('plans uploads, keeps custom previews, skips non-admin repos, and uploads nothing without --yes', async () => {
    vi.stubGlobal(
      'fetch',
      graphql({
        r0: { usesCustomOpenGraphImage: false, openGraphImageUrl: 'x', viewerPermission: 'ADMIN' },
        r1: { usesCustomOpenGraphImage: true, openGraphImageUrl: 'y', viewerPermission: 'ADMIN' },
        r2: { usesCustomOpenGraphImage: false, openGraphImageUrl: 'z', viewerPermission: 'WRITE' },
      }),
    );
    const rendered: string[] = [];
    const lines: string[] = [];
    const targets: ApplyTarget[] = ['new', 'custom', 'noadmin'].map((r) => ({ ref: ref(r), file: `/tmp/${r}.png` }));
    await applyCards(targets, {
      render: async (t) => void rendered.push(t.ref.repo),
      token: 't',
      yes: false,
      overwrite: false,
      headless: true,
      delayMs: 0,
      profileDir: '/tmp/profile',
      log: (m) => lines.push(m),
      source: 'test',
    });
    const out = lines.join('\n');
    expect(rendered).toEqual(['new']);
    expect(out).toMatch(/upload\s+octo\/new/);
    expect(out).toMatch(/keep\s+octo\/custom/);
    expect(out).toMatch(/skip\s+octo\/noadmin/);
    expect(out).toContain('Dry run: nothing was uploaded');
  });

  it('--overwrite includes repos that already have a custom preview', async () => {
    vi.stubGlobal('fetch', graphql({ r0: { usesCustomOpenGraphImage: true, openGraphImageUrl: 'y', viewerPermission: 'ADMIN' } }));
    const rendered: string[] = [];
    await applyCards([{ ref: ref('custom'), file: '/tmp/c.png' }], {
      render: async (t) => void rendered.push(t.ref.repo),
      token: 't',
      yes: false,
      overwrite: true,
      headless: true,
      delayMs: 0,
      profileDir: '/tmp/p',
      log: () => undefined,
      source: 'test',
    });
    expect(rendered).toEqual(['custom']);
  });
});
