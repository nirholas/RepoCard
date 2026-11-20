import { aiDesigns, OpenAiCompatibleProvider, WorkersAiProvider, type LlmProvider } from './design/ai';
import { fallbackDesigns } from './design/fallback';
import { isHex } from './design/color';
import { sanitizeSpec } from './design/validate';
import { CONCEPT_COUNT, type DesignSet, type DesignSpec, type RenderOptions } from './design/types';
import { DEFAULT_AI_MODEL, type Env } from './env';
import { fetchAvatar } from './lib/avatar';
import { badRequest } from './lib/errors';
import { GitHubClient, type RepoData } from './lib/github';
import { fnv1a } from './lib/hash';
import type { RepoRef } from './lib/repo-ref';
import type { CardRepo } from './render/components';

export interface CardInput {
  spec: DesignSpec;
  repo: CardRepo;
  avatar: string | null;
  options: RenderOptions;
}

export interface Renderer {
  png(input: CardInput): Promise<Uint8Array>;
  svg(input: CardInput): Promise<string>;
}

/** The subset of the Workers Cache API used here; caches.default satisfies it. */
export interface CacheLike {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
}

export interface ServiceDeps {
  env: Env;
  renderer: Renderer;
  cache: CacheLike;
  fetcher?: typeof fetch;
  waitUntil: (promise: Promise<unknown>) => void;
  /** Client IP, used as the rate limit key. */
  clientKey: string;
}

export interface CardQuery {
  variant: number;
  format: 'png' | 'svg';
  overrides: Record<string, unknown>;
  options: RenderOptions;
  /** "fast" never calls the LLM; it uses cached AI designs if present, else deterministic ones. */
  mode: 'auto' | 'fast';
}

const DESIGN_TTL_AI = 60 * 60 * 24 * 30;
const DESIGN_TTL_FALLBACK = 60 * 60 * 6;
const REPO_TTL = 60 * 60;
const AVATAR_TTL = 60 * 60 * 24;
const INTERNAL = 'https://cache.repocard.internal';

/** Shared across requests in one isolate, so concurrent variant requests trigger one generation. */
const inflight = new Map<string, Promise<DesignSet>>();

const OVERRIDE_KEYS = ['layout', 'palette', 'font', 'background', 'mark', 'emoji', 'title', 'tagline'] as const;

export function parseCardQuery(params: URLSearchParams, format: 'png' | 'svg'): CardQuery {
  const variantRaw = params.get('variant') ?? params.get('v') ?? '1';
  const variant = Number(variantRaw);
  if (!Number.isInteger(variant) || variant < 1 || variant > CONCEPT_COUNT) {
    throw badRequest(`variant must be an integer from 1 to ${CONCEPT_COUNT}.`);
  }
  const overrides: Record<string, unknown> = {};
  for (const key of OVERRIDE_KEYS) {
    const v = params.get(key);
    if (v !== null && v !== '') overrides[key] = v;
  }
  const chips = params.get('chips');
  if (chips !== null) overrides.chips = chips.split(',').map((c) => c.trim()).filter(Boolean);
  const accent = params.get('accent');
  if (accent) {
    const hex = accent.startsWith('#') ? accent : `#${accent}`;
    if (!isHex(hex)) throw badRequest('accent must be a hex color such as 7c3aed.');
    overrides.accent = hex;
  }
  const flag = (name: string) => !['0', 'false', 'no', 'off'].includes((params.get(name) ?? '').toLowerCase());
  return {
    variant,
    format,
    overrides,
    options: { showStats: flag('stats'), showOwner: flag('owner') },
    mode: params.get('mode') === 'fast' ? 'fast' : 'auto',
  };
}

export class CardService {
  private readonly github: GitHubClient;
  private readonly fetcher: typeof fetch;

  constructor(private readonly deps: ServiceDeps) {
    this.fetcher = deps.fetcher ?? ((i, init) => fetch(i, init));
    this.github = new GitHubClient({ token: deps.env.GITHUB_TOKEN, fetcher: this.fetcher });
  }

  provider(): LlmProvider | null {
    const env = this.deps.env;
    const kind = (env.AI_PROVIDER ?? (env.AI ? 'workers-ai' : env.LLM_BASE_URL ? 'openai-compatible' : 'none')).toLowerCase();
    if (kind === 'workers-ai' && env.AI) return new WorkersAiProvider(env.AI, env.AI_MODEL || DEFAULT_AI_MODEL);
    if (kind === 'openai-compatible' && env.LLM_BASE_URL && env.LLM_API_KEY && env.LLM_MODEL) {
      return new OpenAiCompatibleProvider(env.LLM_BASE_URL, env.LLM_API_KEY, env.LLM_MODEL, this.fetcher);
    }
    return null;
  }

  private async cacheGetJson<T>(key: string): Promise<T | null> {
    try {
      const hit = await this.deps.cache.match(new Request(`${INTERNAL}/${key}`));
      return hit ? ((await hit.json()) as T) : null;
    } catch {
      return null;
    }
  }

  private cachePutJson(key: string, value: unknown, ttl: number): void {
    const res = new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` },
    });
    this.deps.waitUntil(this.deps.cache.put(new Request(`${INTERNAL}/${key}`), res).catch(() => undefined));
  }

  async repo(ref: RepoRef): Promise<RepoData> {
    const key = `repo/v1/${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}`;
    const cached = await this.cacheGetJson<RepoData>(key);
    if (cached) return cached;
    const data = await this.github.getRepo(ref);
    this.cachePutJson(key, data, REPO_TTL);
    return data;
  }

  async avatar(url: string): Promise<string | null> {
    const key = `avatar/v1/${fnv1a(url).toString(36)}`;
    const cached = await this.cacheGetJson<{ uri: string | null }>(key);
    if (cached) return cached.uri;
    const uri = await fetchAvatar(url, this.fetcher);
    this.cachePutJson(key, { uri }, AVATAR_TTL);
    return uri;
  }

  private designKey(ref: RepoRef): string {
    return `designs/v1/${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}`;
  }

  /** Previously generated designs, from the edge cache or KV. */
  async storedDesigns(ref: RepoRef): Promise<DesignSet | null> {
    const key = this.designKey(ref);
    const edge = await this.cacheGetJson<DesignSet>(key);
    if (edge) return edge;
    const raw = await this.deps.env.DESIGNS?.get(key).catch(() => null);
    if (!raw) return null;
    try {
      const set = JSON.parse(raw) as DesignSet;
      this.cachePutJson(key, set, 300);
      return set;
    } catch {
      return null;
    }
  }

  /**
   * Designs for a repository. Generated once and stored, so a card's look is
   * stable across requests. Falls back to deterministic designs when AI is
   * unavailable, rate limited, slow, or returns unusable output.
   */
  async designs(ref: RepoRef, opts: { refresh?: boolean; mode?: 'auto' | 'fast'; repo?: RepoData } = {}): Promise<DesignSet> {
    const key = this.designKey(ref);
    if (!opts.refresh) {
      const stored = await this.storedDesigns(ref);
      if (stored) return stored;
    }
    // Join a generation already running in this isolate (e.g. four variant
    // images requested at once). The timeout guards against waiting on a
    // promise owned by a request that was cancelled.
    const pending = inflight.get(key);
    if (pending && !opts.refresh) {
      const joined = await Promise.race([pending, new Promise<null>((r) => setTimeout(() => r(null), 30_000))]).catch(() => null);
      if (joined) return joined;
    }

    const job = (async () => {
      const repo = opts.repo ?? (await this.repo(ref));
      const provider = opts.mode === 'fast' ? null : this.provider();
      let set: DesignSet | null = null;
      if (provider) {
        const allowed = this.deps.env.AI_LIMITER ? (await this.deps.env.AI_LIMITER.limit({ key: this.deps.clientKey })).success : true;
        if (allowed) {
          try {
            set = await aiDesigns(repo, provider);
          } catch (err) {
            console.warn(JSON.stringify({ event: 'ai_design_failed', repo: repo.fullName, provider: provider.name, message: (err as Error).message }));
          }
        } else {
          console.warn(JSON.stringify({ event: 'ai_rate_limited', repo: repo.fullName }));
        }
      }
      set ??= fallbackDesigns(repo);
      // Deterministic sets are only provisional when AI could produce a better one later.
      // In fast mode nothing is stored, so a later AI request is not blocked.
      if (opts.mode !== 'fast') {
        const ttl = set.source === 'ai' || !provider ? DESIGN_TTL_AI : DESIGN_TTL_FALLBACK;
        this.cachePutJson(key, set, Math.min(ttl, 3600));
        const kv = this.deps.env.DESIGNS;
        if (kv) this.deps.waitUntil(kv.put(key, JSON.stringify(set), { expirationTtl: ttl }).catch(() => undefined));
      }
      return set;
    })();

    inflight.set(key, job);
    try {
      return await job;
    } finally {
      inflight.delete(key);
    }
  }

  /** Resolve everything needed to render one card. */
  async cardInput(ref: RepoRef, query: CardQuery): Promise<{ input: CardInput; set: DesignSet; repo: RepoData }> {
    const repo = await this.repo(ref);
    const set = await this.designs(ref, { mode: query.mode, repo });
    const concept = set.concepts[query.variant - 1] ?? set.concepts[0]!;
    const spec = Object.keys(query.overrides).length ? sanitizeSpec({ ...concept, ...query.overrides }, concept) : concept;
    const avatar = spec.mark === 'avatar' || spec.layout === 'split' || spec.layout === 'editorial' ? await this.avatar(repo.avatarUrl) : null;
    return {
      set,
      repo,
      input: {
        spec,
        avatar,
        options: query.options,
        repo: { owner: repo.owner, name: repo.name, stars: repo.stars, forks: repo.forks, language: repo.language, license: repo.license },
      },
    };
  }
}
