import { VERSION, designsPayload, optionsPayload, repoListPayload, revision } from './cards';
import type { DesignSpec } from './design/types';
import type { Env } from './env';
import { HttpError, badRequest, notFound, rateLimited } from './lib/errors';
import { CORS_HEADERS, SECURITY_HEADERS, clientIp, errorJson, json, readJson, text } from './lib/http';
import { GitHubClient } from './lib/github';
import { isValidOwner, isValidRepo, parseRepoRef, type RepoRef } from './lib/repo-ref';
import { aiPluginManifest, apiCatalog, mcpServerCard, robotsTxt, securityTxt, sitemapXml } from './discovery';
import { llmsFullTxt, llmsTxt } from './llms';
import { handleMcp, type McpBackend } from './mcp';
import { openApiDocument } from './openapi';
import { CardService, parseCardQuery, type CacheLike, type CardInput, type Renderer } from './service';

export interface AppDeps {
  renderer: Renderer;
  cache: CacheLike;
  fetcher?: typeof fetch;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

const IMAGE_CACHE = 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400';
const CARD_PATH = /^\/card\/([^/]+)\/([^/]+)\.(png|svg)$/;
const DESIGNS_PATH = /^\/api\/v1\/cards\/([^/]+)\/([^/]+)$/;
const USER_REPOS_PATH = /^\/api\/v1\/users\/([^/]+)\/repos$/;

function origin(request: Request, env: Env): string {
  return (env.PUBLIC_URL || new URL(request.url).origin).replace(/\/+$/, '');
}

function refFromPath(owner: string, repo: string): RepoRef {
  const o = decodeURIComponent(owner);
  const r = decodeURIComponent(repo);
  if (!isValidOwner(o) || !isValidRepo(r)) throw badRequest('Invalid repository path. Expected /OWNER/REPO.');
  return { owner: o, repo: r };
}

function imageResponse(body: Uint8Array | string, format: 'png' | 'svg', status: number, headers: Record<string, string> = {}): Response {
  return new Response(body as BodyInit, {
    status,
    headers: {
      'content-type': format === 'png' ? 'image/png' : 'image/svg+xml; charset=utf-8',
      'cache-control': status === 200 ? IMAGE_CACHE : 'public, max-age=60',
      'cross-origin-resource-policy': 'cross-origin',
      ...CORS_HEADERS,
      ...SECURITY_HEADERS,
      // SVGs can carry script; neutralize when opened directly.
      ...(format === 'svg' ? { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:" } : {}),
      ...headers,
    },
  });
}

/** A readable card explaining what went wrong, so broken <img> embeds still say something useful. */
async function errorCard(renderer: Renderer, err: HttpError, format: 'png' | 'svg'): Promise<Response> {
  const titles: Record<number, string> = { 400: 'Invalid request', 404: 'Repository not found', 429: 'Too many requests', 503: 'Temporarily unavailable' };
  const spec: DesignSpec = {
    version: 1,
    layout: 'minimal',
    background: 'dots',
    palette: 'obsidian',
    font: 'modern',
    mark: 'none',
    title: titles[err.status] ?? 'Something went wrong',
    tagline: err.message.slice(0, 110),
    chips: [],
    rationale: '',
  };
  const input: CardInput = {
    spec,
    avatar: null,
    options: { showStats: false, showOwner: false },
    repo: { owner: 'RepoCard', name: '', stars: 0, forks: 0, language: null, license: null },
  };
  try {
    const body = format === 'png' ? await renderer.png(input) : await renderer.svg(input);
    return imageResponse(body, format, err.status, { ...err.headers, 'x-repocard-error': err.code });
  } catch {
    return errorJson(err);
  }
}

/** Normalized cache key: path plus known parameters in a fixed order. */
function cardCacheKey(url: URL): Request {
  const keep = ['variant', 'v', 'rev', 'layout', 'palette', 'font', 'background', 'mark', 'emoji', 'accent', 'title', 'tagline', 'chips', 'stats', 'owner', 'mode'];
  const params = new URLSearchParams();
  for (const k of keep) {
    const v = url.searchParams.get(k);
    if (v !== null) params.set(k, v);
  }
  return new Request(`${url.origin}${url.pathname.toLowerCase()}?${params}`);
}

export async function handle(request: Request, env: Env, ctx: ExecutionContextLike, deps: AppDeps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const started = Date.now();

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  const service = new CardService({
    env,
    renderer: deps.renderer,
    cache: deps.cache,
    fetcher: deps.fetcher,
    waitUntil: (p) => ctx.waitUntil(p),
    clientKey: clientIp(request),
  });
  const base = origin(request, env);

  try {
    // Images
    const card = path.match(CARD_PATH);
    if (card) {
      if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'method_not_allowed', 'Use GET.');
      const format = card[3] as 'png' | 'svg';
      try {
        const ref = refFromPath(card[1]!, card[2]!);
        const query = parseCardQuery(url.searchParams, format);
        const key = cardCacheKey(url);
        const cached = await deps.cache.match(key).catch(() => undefined);
        if (cached) return cached;

        if (env.RENDER_LIMITER && !(await env.RENDER_LIMITER.limit({ key: clientIp(request) })).success) {
          throw rateLimited('Too many new images from this address. Cached images are unaffected; try again in a minute.');
        }
        const { input, set } = await service.cardInput(ref, query);
        const body = format === 'png' ? await deps.renderer.png(input) : await deps.renderer.svg(input);
        const res = imageResponse(body, format, 200, {
          'x-repocard-source': set.source,
          'x-repocard-variant': String(query.variant),
          'x-repocard-render-ms': String(Date.now() - started),
        });
        ctx.waitUntil(deps.cache.put(key, res.clone()).catch(() => undefined));
        return res;
      } catch (err) {
        if (err instanceof HttpError) return errorCard(deps.renderer, err, format);
        throw err;
      }
    }

    // JSON API
    if (path === '/api/v1/health' || path === '/health') {
      return json({ ok: true, version: VERSION, ai: service.provider()?.model ?? null, kv: Boolean(env.DESIGNS) });
    }
    if (path === '/api/v1/options') return json(optionsPayload(), { cache: 'public, max-age=86400' });

    const designs = path.match(DESIGNS_PATH);
    if (designs && (method === 'GET' || method === 'HEAD')) {
      const ref = refFromPath(designs[1]!, designs[2]!);
      const repo = await service.repo(ref);
      const set = await service.designs(ref, { repo, mode: url.searchParams.get('mode') === 'fast' ? 'fast' : 'auto' });
      return json(designsPayload(base, repo, set), { headers: { 'x-repocard-rev': revision(set) } });
    }

    if (path === '/api/v1/cards' && method === 'POST') {
      const body = (await readJson(request)) as { repo?: unknown; refresh?: unknown };
      const ref = parseRepoRef(String(body?.repo ?? ''));
      if (!ref) throw badRequest('Body must include "repo": an owner/repo or a github.com repository URL.');
      const repo = await service.repo(ref);
      const set = await service.designs(ref, { repo, refresh: body.refresh === true });
      return json(designsPayload(base, repo, set));
    }

    const userRepos = path.match(USER_REPOS_PATH);
    if (userRepos && method === 'GET') {
      const owner = decodeURIComponent(userRepos[1]!);
      if (!isValidOwner(owner)) throw badRequest('Invalid GitHub user or organization.');
      const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100));
      const github = new GitHubClient({ token: env.GITHUB_TOKEN, fetcher: deps.fetcher });
      const all = await github.listRepos(owner, limit);
      const repos = all.filter(
        (r) => (url.searchParams.get('forks') === '1' || !r.fork) && (url.searchParams.get('archived') === '1' || !r.archived),
      );
      return json(repoListPayload(base, owner, repos), { cache: 'public, max-age=300' });
    }

    if (path === '/mcp') {
      const backend: McpBackend = {
        origin: base,
        designs: async (ref, refresh) => {
          const repo = await service.repo(ref);
          return { repo, set: await service.designs(ref, { repo, refresh }) };
        },
        renderPng: async (ref, params) => {
          const { input } = await service.cardInput(ref, parseCardQuery(params, 'png'));
          return deps.renderer.png(input);
        },
        listRepos: (owner, limit) => new GitHubClient({ token: env.GITHUB_TOKEN, fetcher: deps.fetcher }).listRepos(owner, limit),
      };
      return handleMcp(request, backend);
    }

    if (path === '/openapi.json') return json(openApiDocument(base), { cache: 'public, max-age=3600' });
    if (path === '/llms.txt') return text(llmsTxt(base), 'text/plain; charset=utf-8');
    if (path === '/llms-full.txt') return text(llmsFullTxt(base), 'text/plain; charset=utf-8');
    if (path === '/robots.txt') return text(robotsTxt(base), 'text/plain; charset=utf-8', 'public, max-age=86400');
    if (path === '/sitemap.xml') return text(sitemapXml(base), 'application/xml; charset=utf-8', 'public, max-age=86400');
    if (path === '/.well-known/security.txt') return text(securityTxt(base), 'text/plain; charset=utf-8', 'public, max-age=86400');
    if (path === '/.well-known/mcp.json' || path === '/.well-known/mcp/server-card.json') {
      return json(mcpServerCard(base), { cache: 'public, max-age=3600' });
    }
    if (path === '/.well-known/api-catalog') {
      return new Response(JSON.stringify(apiCatalog(base), null, 2), {
        headers: { 'content-type': 'application/linkset+json; charset=utf-8', 'cache-control': 'public, max-age=3600', ...CORS_HEADERS, ...SECURITY_HEADERS },
      });
    }
    if (path === '/.well-known/ai-plugin.json') return json(aiPluginManifest(base), { cache: 'public, max-age=3600' });

    if (path.startsWith('/api/')) throw notFound(`No API route for ${method} ${path}.`);

    // Static site
    if (env.ASSETS) return env.ASSETS.fetch(request);
    throw notFound('Not found.');
  } catch (err) {
    return errorJson(err);
  }
}
