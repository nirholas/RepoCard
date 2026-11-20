import { HttpError, notFound, upstream } from './errors';
import type { RepoRef } from './repo-ref';

export interface LanguageShare {
  name: string;
  share: number;
}

export interface RepoData {
  owner: string;
  name: string;
  fullName: string;
  description: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  languages: LanguageShare[];
  topics: string[];
  license: string | null;
  homepage: string | null;
  ownerType: 'User' | 'Organization';
  avatarUrl: string;
  archived: boolean;
  fork: boolean;
  pushedAt: string;
  /** README converted to plain text and truncated. Empty when the repo has none. */
  readme: string;
}

export interface RepoSummary {
  fullName: string;
  description: string;
  stars: number;
  language: string | null;
  fork: boolean;
  archived: boolean;
  pushedAt: string;
}

export interface GitHubClientOptions {
  token?: string;
  fetcher?: typeof fetch;
  userAgent?: string;
}

const API = 'https://api.github.com';
const README_LIMIT = 6000;

/** Minimal read-only GitHub REST client. Never writes to GitHub. */
export class GitHubClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: GitHubClientOptions = {}) {
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  }

  private headers(accept = 'application/vnd.github+json'): HeadersInit {
    const h: Record<string, string> = {
      accept,
      'user-agent': this.options.userAgent ?? 'RepoCard (+https://github.com/nirholas/RepoCard)',
      'x-github-api-version': '2022-11-28',
    };
    if (this.options.token) h.authorization = `Bearer ${this.options.token}`;
    return h;
  }

  private async request(path: string, accept?: string): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetcher(`${API}${path}`, { headers: this.headers(accept) });
    } catch (err) {
      throw upstream(`Could not reach GitHub: ${(err as Error).message}`);
    }
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      const retry = Number.isFinite(reset) && reset > 0 ? Math.max(1, reset - Math.floor(Date.now() / 1000)) : 60;
      if (res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429) {
        throw new HttpError(503, 'github_rate_limited', 'GitHub API rate limit reached. Try again shortly.', {
          'retry-after': String(Math.min(retry, 3600)),
        });
      }
    }
    return res;
  }

  async getRepo(ref: RepoRef): Promise<RepoData> {
    const path = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
    const res = await this.request(path);
    if (res.status === 404) throw notFound(`Repository ${ref.owner}/${ref.repo} was not found or is private.`);
    if (!res.ok) throw upstream(`GitHub returned ${res.status} for ${ref.owner}/${ref.repo}.`);
    const r = (await res.json()) as GitHubRepo;

    const [languages, readme] = await Promise.all([
      this.getLanguages(path).catch(() => []),
      this.getReadme(path).catch(() => ''),
    ]);

    return {
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      description: (r.description ?? '').trim(),
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      openIssues: r.open_issues_count ?? 0,
      language: r.language ?? languages[0]?.name ?? null,
      languages,
      topics: Array.isArray(r.topics) ? r.topics.slice(0, 20) : [],
      license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null,
      homepage: r.homepage || null,
      ownerType: r.owner.type === 'Organization' ? 'Organization' : 'User',
      avatarUrl: r.owner.avatar_url,
      archived: Boolean(r.archived),
      fork: Boolean(r.fork),
      pushedAt: r.pushed_at ?? '',
      readme,
    };
  }

  private async getLanguages(repoPath: string): Promise<LanguageShare[]> {
    const res = await this.request(`${repoPath}/languages`);
    if (!res.ok) return [];
    const bytes = (await res.json()) as Record<string, number>;
    const total = Object.values(bytes).reduce((a, b) => a + b, 0);
    if (!total) return [];
    return Object.entries(bytes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, n]) => ({ name, share: Math.round((n / total) * 1000) / 10 }));
  }

  private async getReadme(repoPath: string): Promise<string> {
    const res = await this.request(`${repoPath}/readme`, 'application/vnd.github.raw+json');
    if (!res.ok) return '';
    return readmeToText(await res.text()).slice(0, README_LIMIT);
  }

  /** Public, non-fork-filtered repositories for a user or organization, most recently pushed first. */
  async listRepos(owner: string, limit = 100): Promise<RepoSummary[]> {
    const out: RepoSummary[] = [];
    const perPage = 100;
    for (let page = 1; out.length < limit && page <= 10; page++) {
      const res = await this.request(
        `/users/${encodeURIComponent(owner)}/repos?type=owner&sort=pushed&per_page=${perPage}&page=${page}`,
      );
      if (res.status === 404) throw notFound(`GitHub user or organization "${owner}" was not found.`);
      if (!res.ok) throw upstream(`GitHub returned ${res.status} while listing repositories for ${owner}.`);
      const batch = (await res.json()) as GitHubRepo[];
      for (const r of batch) {
        if (r.private) continue;
        out.push({
          fullName: r.full_name,
          description: (r.description ?? '').trim(),
          stars: r.stargazers_count ?? 0,
          language: r.language ?? null,
          fork: Boolean(r.fork),
          archived: Boolean(r.archived),
          pushedAt: r.pushed_at ?? '',
        });
      }
      if (batch.length < perPage) break;
    }
    return out.slice(0, limit);
  }
}

/**
 * Reduce Markdown/HTML to prose an LLM can read cheaply: drops code blocks,
 * images, badges, HTML tags and link targets, and collapses whitespace.
 */
export function readmeToText(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_]{1,3}([^*_\n]+)[*_]{1,3}/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  private?: boolean;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  language?: string | null;
  topics?: string[];
  license?: { spdx_id?: string | null } | null;
  homepage?: string | null;
  archived?: boolean;
  fork?: boolean;
  pushed_at?: string;
  owner: { login: string; type: string; avatar_url: string };
}
