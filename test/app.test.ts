import { beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../src/app';
import type { Env } from '../src/env';
import { GitHubClient } from '../src/lib/github';
import type { CardInput, Renderer } from '../src/service';
import { fakeFetch, githubRoutes, MemoryCache, MemoryKv } from './fixtures';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

class FakeRenderer implements Renderer {
  readonly inputs: CardInput[] = [];
  async png(input: CardInput) {
    this.inputs.push(input);
    return PNG;
  }
  async svg(input: CardInput) {
    this.inputs.push(input);
    return '<svg xmlns="http://www.w3.org/2000/svg"/>';
  }
}

function setup(env: Partial<Env> = {}) {
  const renderer = new FakeRenderer();
  const cache = new MemoryCache();
  const fetcher = fakeFetch();
  const waits: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) };
  const fullEnv: Env = { DESIGNS: new MemoryKv(), ...env };
  const call = async (path: string, init?: RequestInit) => {
    const res = await handle(new Request(`https://repocard.test${path}`, init), fullEnv, ctx, { renderer, cache, fetcher });
    await Promise.all(waits.splice(0));
    return res;
  };
  return { call, renderer, cache, fetcher, env: fullEnv };
}

const mcp = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('card images', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('renders a PNG with caching and CORS headers', async () => {
    const res = await t.call('/card/octo/widget-kit.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(res.headers.get('cache-control')).toContain('s-maxage');
    expect(res.headers.get('x-repocard-source')).toBe('fallback');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it('serves repeat requests from cache', async () => {
    await t.call('/card/octo/widget-kit.png?variant=2');
    await t.call('/card/octo/widget-kit.png?variant=2&utm=ignored');
    expect(t.renderer.inputs).toHaveLength(1);
  });

  it('applies query overrides and display options', async () => {
    await t.call('/card/octo/widget-kit.png?layout=poster&palette=sky&accent=ff00aa&title=Widgets&stats=0&owner=false&chips=a,b');
    const input = t.renderer.inputs[0]!;
    expect(input.spec).toMatchObject({ layout: 'poster', palette: 'sky', accent: '#ff00aa', title: 'Widgets', chips: ['a', 'b'] });
    expect(input.options).toEqual({ showStats: false, showOwner: false });
  });

  it('renders SVG with a restrictive CSP', async () => {
    const res = await t.call('/card/octo/widget-kit.svg');
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('returns an error card for missing repositories', async () => {
    const res = await t.call('/card/octo/missing.png');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-repocard-error')).toBe('not_found');
    expect(t.renderer.inputs[0]!.spec.title).toBe('Repository not found');
  });

  it('rejects invalid parameters with a 400 error card', async () => {
    expect((await t.call('/card/octo/widget-kit.png?variant=7')).status).toBe(400);
    expect((await t.call('/card/octo/widget-kit.png?accent=zzz')).status).toBe(400);
    expect((await t.call('/card/-bad-/widget-kit.png')).status).toBe(400);
  });

  it('rate limits uncached renders', async () => {
    const limited = setup({ RENDER_LIMITER: { limit: async () => ({ success: false }) } });
    const res = await limited.call('/card/octo/widget-kit.png');
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('uses the AI provider when configured and stores designs in KV', async () => {
    const concepts = ['terminal', 'editorial', 'poster', 'split'].map((layout) => ({
      layout,
      background: 'grid',
      palette: 'terminal',
      font: 'technical',
      mark: 'avatar',
      title: 'widget-kit',
      tagline: 'AI tagline.',
      chips: [],
      rationale: 'r',
    }));
    let calls = 0;
    const ai = setup({ AI: { run: async () => ((calls += 1), { response: { concepts } }) } });
    const res = await ai.call('/card/octo/widget-kit.png?variant=3');
    expect(res.headers.get('x-repocard-source')).toBe('ai');
    expect(ai.renderer.inputs[0]!.spec.layout).toBe('poster');
    await ai.call('/card/octo/widget-kit.png?variant=4');
    expect(calls).toBe(1);
    expect([...(ai.env.DESIGNS as MemoryKv).store.keys()]).toEqual(['designs/v1/octo/widget-kit']);
  });

  it('falls back when the AI fails', async () => {
    const broken = setup({ AI: { run: async () => Promise.reject(new Error('boom')) } });
    const res = await broken.call('/card/octo/widget-kit.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-repocard-source')).toBe('fallback');
  });

  it('fast mode never calls the AI', async () => {
    let calls = 0;
    const fast = setup({ AI: { run: async () => ((calls += 1), {}) } });
    await fast.call('/card/octo/widget-kit.png?mode=fast');
    expect(calls).toBe(0);
  });
});

describe('JSON API', () => {
  it('returns design concepts with URLs and setup steps', async () => {
    const t = setup();
    const res = await t.call('/api/v1/cards/octo/widget-kit');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { concepts: { png: string; variant: number }[]; setup: { settingsUrl: string; steps: string[] } };
    expect(body.concepts).toHaveLength(4);
    expect(body.concepts[1]!.png).toMatch(/^https:\/\/repocard\.test\/card\/octo\/widget-kit\.png\?variant=2&rev=/);
    expect(body.setup.settingsUrl).toBe('https://github.com/octo/widget-kit/settings');
    expect(body.setup.steps.length).toBeGreaterThan(2);
  });

  it('accepts any repository URL via POST', async () => {
    const t = setup();
    const res = await t.call('/api/v1/cards', { method: 'POST', body: JSON.stringify({ repo: 'https://github.com/octo/widget-kit/tree/main' }) });
    expect(res.status).toBe(200);
    const bad = await t.call('/api/v1/cards', { method: 'POST', body: JSON.stringify({ repo: 'nope' }) });
    expect(bad.status).toBe(400);
    const invalid = await t.call('/api/v1/cards', { method: 'POST', body: '{' });
    expect(invalid.status).toBe(400);
  });

  it('lists account repositories without forks and archived by default', async () => {
    const t = setup();
    const body = (await (await t.call('/api/v1/users/octo/repos')).json()) as { repositories: { fullName: string }[] };
    expect(body.repositories.map((r) => r.fullName)).toEqual(['octo/widget-kit']);
    const all = (await (await t.call('/api/v1/users/octo/repos?forks=1&archived=1')).json()) as { count: number };
    expect(all.count).toBe(3);
  });

  it('serves options, health, OpenAPI, llms.txt, CORS preflight, and 404s', async () => {
    const t = setup();
    expect(((await (await t.call('/api/v1/options')).json()) as { layouts: string[] }).layouts).toContain('terminal');
    expect(((await (await t.call('/api/v1/health')).json()) as { ok: boolean }).ok).toBe(true);
    expect(((await (await t.call('/openapi.json')).json()) as { openapi: string }).openapi).toBe('3.1.0');
    expect(await (await t.call('/llms.txt')).text()).toContain('https://repocard.test/mcp');
    const pre = await t.call('/card/octo/widget-kit.png', { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('GET');
    expect((await t.call('/api/v1/missing')).status).toBe(404);
  });

  it('maps GitHub rate limits to 503 with retry-after', async () => {
    const routes = githubRoutes();
    routes['/repos/octo/widget-kit'] = () =>
      new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 120) } });
    const client = new GitHubClient({ fetcher: fakeFetch(routes) });
    await expect(client.getRepo({ owner: 'octo', repo: 'widget-kit' })).rejects.toMatchObject({ status: 503, code: 'github_rate_limited' });
  });
});

describe('GitHub client', () => {
  const gql = {
    name: 'widget-kit', nameWithOwner: 'octo/widget-kit', description: 'From GraphQL.', stargazerCount: 9, forkCount: 2,
    isPrivate: false, isArchived: false, isFork: false, pushedAt: '2026-11-01T00:00:00Z', homepageUrl: '',
    issues: { totalCount: 1 }, primaryLanguage: { name: 'TypeScript' },
    languages: { totalSize: 100, edges: [{ size: 75, node: { name: 'TypeScript' } }, { size: 25, node: { name: 'CSS' } }] },
    repositoryTopics: { nodes: [{ topic: { name: 'ui' } }] }, licenseInfo: { spdxId: 'MIT' },
    owner: { __typename: 'Organization', login: 'octo', avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4' },
    readme1: null, readme2: { text: '# Hi\n\nReadme body.' },
  };

  it('uses a single GraphQL request when a token is set', async () => {
    const routes = githubRoutes();
    routes['/graphql'] = () => Response.json({ data: { repository: gql } });
    const fetcher = fakeFetch(routes);
    const repo = await new GitHubClient({ token: 't', fetcher }).getRepo({ owner: 'octo', repo: 'widget-kit' });
    expect(fetcher.calls).toEqual(['https://api.github.com/graphql']);
    expect(repo).toMatchObject({ description: 'From GraphQL.', stars: 9, language: 'TypeScript', topics: ['ui'], license: 'MIT', ownerType: 'Organization' });
    expect(repo.languages).toEqual([{ name: 'TypeScript', share: 75 }, { name: 'CSS', share: 25 }]);
    expect(repo.readme).toContain('Readme body.');
  });

  it('maps GraphQL NOT_FOUND to 404 and falls back to REST on other failures', async () => {
    const routes = githubRoutes();
    routes['/graphql'] = () => Response.json({ data: { repository: null }, errors: [{ type: 'NOT_FOUND' }] });
    await expect(new GitHubClient({ token: 't', fetcher: fakeFetch(routes) }).getRepo({ owner: 'octo', repo: 'x' })).rejects.toMatchObject({ status: 404 });
    routes['/graphql'] = () => new Response('', { status: 403 });
    const fetcher = fakeFetch(routes);
    const repo = await new GitHubClient({ token: 't', fetcher }).getRepo({ owner: 'octo', repo: 'widget-kit' });
    expect(repo.stars).toBe(1234);
    expect(fetcher.calls.length).toBe(4);
  });
});

describe('MCP', () => {
  it('initializes and negotiates the protocol version', async () => {
    const t = setup();
    const res = await t.call('/mcp', mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }));
    const body = (await res.json()) as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(body.result.protocolVersion).toBe('2025-03-26');
    expect(body.result.serverInfo.name).toBe('repocard');
    const unknown = (await (await t.call('/mcp', mcp({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }))).json()) as {
      result: { protocolVersion: string };
    };
    expect(unknown.result.protocolVersion).toBe('2025-11-25');
  });

  it('accepts notifications with 202 and lists tools', async () => {
    const t = setup();
    expect((await t.call('/mcp', mcp({ jsonrpc: '2.0', method: 'notifications/initialized' }))).status).toBe(202);
    const body = (await (await t.call('/mcp', mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))).json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.map((x) => x.name)).toEqual([
      'create_social_preview',
      'get_design_concepts',
      'list_account_cards',
      'how_to_set_social_preview',
      'get_design_options',
    ]);
  });

  it('create_social_preview returns an image and setup steps', async () => {
    const t = setup();
    const res = await t.call(
      '/mcp',
      mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_social_preview', arguments: { repo: 'github.com/octo/widget-kit', variant: 2, palette: 'sky' } } }),
    );
    const body = (await res.json()) as { result: { content: { type: string; data?: string; text?: string }[]; structuredContent: { png: string; design: { palette: string } } } };
    expect(body.result.content[0]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(atob(body.result.content[0]!.data!).charCodeAt(1)).toBe(0x50);
    expect(body.result.structuredContent.png).toContain('palette=sky');
    expect(body.result.structuredContent.design.palette).toBe('sky');
  });

  it('reports tool errors as results and protocol errors as errors', async () => {
    const t = setup();
    const toolErr = (await (
      await t.call('/mcp', mcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'create_social_preview', arguments: { repo: 'x' } } }))
    ).json()) as { result: { isError: boolean } };
    expect(toolErr.result.isError).toBe(true);
    const missing = (await (
      await t.call('/mcp', mcp({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'create_social_preview', arguments: { repo: 'octo/missing' } } }))
    ).json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(missing.result.isError).toBe(true);
    expect(missing.result.content[0]!.text).toMatch(/not found/);
    const method = (await (await t.call('/mcp', mcp({ jsonrpc: '2.0', id: 6, method: 'nope' }))).json()) as { error: { code: number } };
    expect(method.error.code).toBe(-32601);
    const parse = await t.call('/mcp', { method: 'POST', body: '{oops' });
    expect(parse.status).toBe(400);
    expect((await t.call('/mcp')).status).toBe(405);
  });

  it('supports batches and the other tools', async () => {
    const t = setup();
    const res = await t.call(
      '/mcp',
      mcp([
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_account_cards', arguments: { owner: 'octo' } } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'how_to_set_social_preview', arguments: { repo: 'octo/widget-kit' } } },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_design_options', arguments: {} } },
        { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_design_concepts', arguments: { repo: 'octo/widget-kit' } } },
        { jsonrpc: '2.0', method: 'notifications/cancelled' },
      ]),
    );
    const body = (await res.json()) as { id: number; result: { content: { text: string }[]; isError?: boolean } }[];
    expect(body.map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect(body.every((r) => !r.result.isError)).toBe(true);
    expect(body[1]!.result.content[0]!.text).toContain('https://github.com/octo/widget-kit/settings');
  });
});
