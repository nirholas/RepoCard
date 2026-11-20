import type { RepoData } from '../src/lib/github';

export function repoFixture(overrides: Partial<RepoData> = {}): RepoData {
  return {
    owner: 'octo',
    name: 'widget-kit',
    fullName: 'octo/widget-kit',
    description: 'Composable widgets for building dashboards in TypeScript.',
    stars: 1234,
    forks: 56,
    openIssues: 7,
    language: 'TypeScript',
    languages: [
      { name: 'TypeScript', share: 91.2 },
      { name: 'CSS', share: 8.8 },
    ],
    topics: ['dashboard', 'widgets', 'ui'],
    license: 'MIT',
    homepage: null,
    ownerType: 'Organization',
    avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
    archived: false,
    fork: false,
    pushedAt: '2026-11-01T00:00:00Z',
    readme: 'Widget Kit\n\nComposable widgets for building dashboards. Install with npm.',
    ...overrides,
  };
}

/** GitHub REST API responses for octo/widget-kit, keyed by path. */
export function githubRoutes(): Record<string, () => Response> {
  const repo = {
    name: 'widget-kit',
    full_name: 'octo/widget-kit',
    description: 'Composable widgets for building dashboards in TypeScript.',
    stargazers_count: 1234,
    forks_count: 56,
    open_issues_count: 7,
    language: 'TypeScript',
    topics: ['dashboard', 'widgets', 'ui'],
    license: { spdx_id: 'MIT' },
    homepage: '',
    archived: false,
    fork: false,
    pushed_at: '2026-11-01T00:00:00Z',
    owner: { login: 'octo', type: 'Organization', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
  };
  return {
    '/repos/octo/widget-kit': () => Response.json(repo),
    '/repos/octo/widget-kit/languages': () => Response.json({ TypeScript: 9120, CSS: 880 }),
    '/repos/octo/widget-kit/readme': () => new Response('# Widget Kit\n\n![badge](https://x/y.svg)\n\nComposable widgets for building dashboards.'),
    '/users/octo/repos': () =>
      Response.json([
        { ...repo },
        { ...repo, name: 'old-fork', full_name: 'octo/old-fork', fork: true },
        { ...repo, name: 'legacy', full_name: 'octo/legacy', archived: true },
      ]),
  };
}

/** A fetch stub that serves GitHub API routes and a tiny PNG avatar. */
export function fakeFetch(routes: Record<string, () => Response> = githubRoutes()): typeof fetch & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.href);
    if (url.hostname === 'avatars.githubusercontent.com') {
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { headers: { 'content-type': 'image/png' } });
    }
    const route = routes[url.pathname];
    return route ? route() : new Response('{"message":"Not Found"}', { status: 404 });
  }) as typeof fetch & { calls: string[] };
  fn.calls = calls;
  return fn;
}

/** In-memory stand-in for the Workers Cache API. */
export class MemoryCache {
  readonly store = new Map<string, Response>();
  async match(key: Request): Promise<Response | undefined> {
    return this.store.get(key.url)?.clone();
  }
  async put(key: Request, res: Response): Promise<void> {
    this.store.set(key.url, res.clone());
  }
}

export class MemoryKv {
  readonly store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}
