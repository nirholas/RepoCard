/**
 * repocard: generate GitHub social preview cards from the command line and,
 * optionally, upload them to every repository in your own browser session.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { satori } from '@cf-wasm/satori/node';
import { aiDesigns, OpenAiCompatibleProvider } from '../../../src/design/ai';
import { fallbackDesigns } from '../../../src/design/fallback';
import { sanitizeSpec } from '../../../src/design/validate';
import type { DesignSet } from '../../../src/design/types';
import { fetchAvatar } from '../../../src/lib/avatar';
import { GitHubClient, type RepoData, type RepoSummary } from '../../../src/lib/github';
import { isValidOwner, parseRepoRef, type RepoRef } from '../../../src/lib/repo-ref';
import { RenderEngine } from '../../../src/render/engine';
import { FONT_MANIFEST } from '../../../src/render/fonts';
import { applyCards, type ApplyTarget } from './apply';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';

const HELP = `repocard ${VERSION}
AI-designed social preview images for GitHub repositories.

Usage
  repocard card <repo> [options]        Render one card to a PNG
  repocard bulk <owner> [options]       Render cards for every public repo of an account
  repocard apply <owner|repo...> [opts] Upload cards in your own browser (dry run unless --yes)
  repocard status <owner>               Show which repos already use a custom preview

Options
  -o, --out <path>        Output file (card) or directory (bulk). Default: ./<repo>.png, ./social-previews
  -v, --variant <1-4>     Which design concept to use. Default: 1
      --layout <name>     spotlight | split | editorial | terminal | poster | minimal
      --palette <name>    midnight | obsidian | aurora | ember | nebula | ocean | forest | terminal |
                          crimson | gold | paper | snow | mint | blush | sand | sky
      --font <name>       modern | geometric | technical | editorial | friendly | expressive
      --tagline <text>    Override the tagline
      --endpoint <url>    Use a RepoCard server (AI designs) instead of rendering locally.
                          Also read from REPOCARD_URL.
      --forks             Include forks (bulk, apply, status)
      --archived          Include archived repositories (bulk, apply, status)
      --limit <n>         Maximum repositories. Default: 300
      --yes               apply: actually upload (otherwise a dry run)
      --overwrite         apply: replace previews that are already custom
      --profile <dir>     apply: browser profile directory. Default: ~/.repocard/browser
      --headless          apply: run the browser without a window (after you have logged in once)
      --delay <ms>        apply: pause between repositories. Default: 2000
  -h, --help              Show this help
      --version           Show the version

Environment
  GITHUB_TOKEN / GH_TOKEN Read-only token for higher GitHub API limits (falls back to \`gh auth token\`)
  REPOCARD_URL            RepoCard server to use for AI designs
  LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
                          Any OpenAI-compatible endpoint for local AI designs (Groq, OpenRouter, Ollama…)

Examples
  npx repocard card vercel/next.js
  npx repocard bulk my-org -o ./previews
  npx repocard apply my-username            # dry run
  npx repocard apply my-username --yes      # upload
`;

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function fail(message: string, code = 1): never {
  console.error(`\x1b[31merror\x1b[0m ${message}`);
  process.exit(code);
}

function info(message: string) {
  console.log(message);
}

function githubToken(): string | undefined {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function fontsDir(): string {
  // Published package: ./fonts next to dist/. Monorepo dev: src/render/font-files.
  const candidates = [join(here, '..', 'fonts'), join(here, '..', '..', '..', 'src', 'render', 'font-files')];
  const dir = candidates.find((d) => existsSync(join(d, FONT_MANIFEST[0].file)));
  if (!dir) fail('Bundled fonts are missing. Reinstall repocard.');
  return dir;
}

let engine: RenderEngine | undefined;
function getEngine(): RenderEngine {
  if (engine) return engine;
  const dir = fontsDir();
  engine = new RenderEngine({
    satori: satori as never,
    resvg: readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')),
    fonts: FONT_MANIFEST.map((f) => {
      const b = readFileSync(join(dir, f.file));
      return { name: f.name, weight: f.weight, style: f.style, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer };
    }),
  });
  return engine;
}

interface CardOptions {
  variant: number;
  overrides: Record<string, string>;
  endpoint?: string;
}

/** Produces PNGs either locally or through a RepoCard server. */
class CardMaker {
  private readonly github: GitHubClient;
  private readonly llm: OpenAiCompatibleProvider | null;

  constructor(private readonly opts: CardOptions) {
    this.github = new GitHubClient({ token: githubToken(), userAgent: `repocard-cli/${VERSION}` });
    const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = process.env;
    this.llm = LLM_BASE_URL && LLM_API_KEY && LLM_MODEL ? new OpenAiCompatibleProvider(LLM_BASE_URL, LLM_API_KEY, LLM_MODEL) : null;
  }

  get source(): string {
    if (this.opts.endpoint) return `server ${this.opts.endpoint}`;
    return this.llm ? `local, AI via ${process.env.LLM_MODEL}` : 'local, deterministic designs';
  }

  async png(ref: RepoRef): Promise<Uint8Array> {
    if (this.opts.endpoint) return this.remote(ref);
    const repo = await this.github.getRepo(ref);
    const set = await this.designs(repo);
    const concept = set.concepts[this.opts.variant - 1] ?? set.concepts[0]!;
    const spec = Object.keys(this.opts.overrides).length ? sanitizeSpec({ ...concept, ...this.opts.overrides }, concept) : concept;
    const avatar = await fetchAvatar(repo.avatarUrl);
    return getEngine().png({
      spec,
      avatar,
      options: { showStats: true, showOwner: true },
      repo: { owner: repo.owner, name: repo.name, stars: repo.stars, forks: repo.forks, language: repo.language, license: repo.license },
    });
  }

  private async designs(repo: RepoData): Promise<DesignSet> {
    if (!this.llm) return fallbackDesigns(repo);
    try {
      return await aiDesigns(repo, this.llm);
    } catch (err) {
      console.warn(`  AI design failed for ${repo.fullName} (${(err as Error).message}); using deterministic design.`);
      return fallbackDesigns(repo);
    }
  }

  private async remote(ref: RepoRef): Promise<Uint8Array> {
    const url = new URL(`/card/${ref.owner}/${ref.repo}.png`, this.opts.endpoint);
    if (this.opts.variant !== 1) url.searchParams.set('variant', String(this.opts.variant));
    for (const [k, v] of Object.entries(this.opts.overrides)) url.searchParams.set(k, v);
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, { headers: { 'user-agent': `repocard-cli/${VERSION}` } });
      if (res.status === 429 || res.status === 503) {
        await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`${url.host} returned ${res.status} (${res.headers.get('x-repocard-error') ?? 'error'})`);
      return new Uint8Array(await res.arrayBuffer());
    }
    throw new Error('RepoCard server is rate limiting; try again later.');
  }

  listRepos(owner: string, limit: number) {
    return this.github.listRepos(owner, limit);
  }
}

async function resolveTargets(maker: CardMaker, inputs: string[], flags: { forks: boolean; archived: boolean; limit: number }): Promise<RepoRef[]> {
  const refs: RepoRef[] = [];
  for (const input of inputs) {
    const ref = input.includes('/') ? parseRepoRef(input) : null;
    if (ref) {
      refs.push(ref);
      continue;
    }
    const owner = input.replace(/^@/, '');
    if (!isValidOwner(owner)) fail(`"${input}" is not a repository or GitHub account.`);
    const repos: RepoSummary[] = await maker.listRepos(owner, flags.limit);
    for (const r of repos) {
      if ((!flags.forks && r.fork) || (!flags.archived && r.archived)) continue;
      refs.push(parseRepoRef(r.fullName)!);
    }
  }
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = `${r.owner}/${r.repo}`.toLowerCase();
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      variant: { type: 'string', short: 'v', default: '1' },
      layout: { type: 'string' },
      palette: { type: 'string' },
      font: { type: 'string' },
      tagline: { type: 'string' },
      endpoint: { type: 'string' },
      forks: { type: 'boolean', default: false },
      archived: { type: 'boolean', default: false },
      limit: { type: 'string', default: '300' },
      yes: { type: 'boolean', default: false },
      overwrite: { type: 'boolean', default: false },
      profile: { type: 'string' },
      headless: { type: 'boolean', default: false },
      delay: { type: 'string', default: '2000' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', default: false },
    },
  });

  if (values.version) return info(VERSION);
  const [command, ...args] = positionals;
  if (values.help || !command || command === 'help') return info(HELP);

  const variant = Number(values.variant);
  if (!Number.isInteger(variant) || variant < 1 || variant > 4) fail('--variant must be 1, 2, 3 or 4.');
  const limit = Math.max(1, Math.min(1000, Number(values.limit) || 300));
  const overrides: Record<string, string> = {};
  for (const k of ['layout', 'palette', 'font', 'tagline'] as const) if (values[k]) overrides[k] = values[k]!;
  const endpoint = values.endpoint ?? process.env.REPOCARD_URL;
  const maker = new CardMaker({ variant, overrides, endpoint });
  const flags = { forks: values.forks!, archived: values.archived!, limit };

  switch (command) {
    case 'card': {
      const ref = parseRepoRef(args[0] ?? '');
      if (!ref) fail('Usage: repocard card <owner/repo | github URL>');
      const out = resolve(values.out ?? `${ref.repo}.png`);
      const png = await maker.png(ref);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, png);
      info(`✓ ${ref.owner}/${ref.repo} → ${out} (${Math.round(png.byteLength / 1024)} KB, ${maker.source})`);
      info(`  Upload it at https://github.com/${ref.owner}/${ref.repo}/settings → Social preview`);
      return;
    }

    case 'bulk': {
      if (!args.length) fail('Usage: repocard bulk <owner> [-o dir]');
      const refs = await resolveTargets(maker, args, flags);
      const dir = resolve(values.out ?? 'social-previews');
      mkdirSync(dir, { recursive: true });
      info(`Rendering ${refs.length} cards (${maker.source}) → ${dir}`);
      let ok = 0;
      for (const ref of refs) {
        try {
          writeFileSync(join(dir, `${ref.owner}__${ref.repo}.png`), await maker.png(ref));
          ok += 1;
          info(`  ✓ ${ref.owner}/${ref.repo}`);
        } catch (err) {
          info(`  ✗ ${ref.owner}/${ref.repo}: ${(err as Error).message}`);
        }
      }
      info(`Done: ${ok}/${refs.length}. Upload each at https://github.com/OWNER/REPO/settings → Social preview, or run \`repocard apply\`.`);
      if (ok < refs.length) process.exitCode = 1;
      return;
    }

    case 'status': {
      if (!args.length) fail('Usage: repocard status <owner>');
      const token = githubToken();
      if (!token) fail('status needs a GitHub token (GITHUB_TOKEN, GH_TOKEN, or `gh auth login`).');
      const refs = await resolveTargets(maker, args, flags);
      const { previewStatus } = await import('./apply');
      const status = await previewStatus(refs, token);
      for (const ref of refs) {
        const s = status.get(`${ref.owner}/${ref.repo}`.toLowerCase());
        info(`${s?.custom ? '✓ custom ' : '· default'}  ${ref.owner}/${ref.repo}${s && !s.admin ? '  (no admin access)' : ''}`);
      }
      return;
    }

    case 'apply': {
      if (!args.length) fail('Usage: repocard apply <owner | owner/repo ...> [--yes]');
      const refs = await resolveTargets(maker, args, flags);
      const cacheDir = join(homedir(), '.repocard', 'cards');
      const targets: ApplyTarget[] = refs.map((ref) => ({ ref, file: join(cacheDir, ref.owner, `${ref.repo}.png`) }));
      await applyCards(targets, {
        render: async (t) => {
          mkdirSync(dirname(t.file), { recursive: true });
          writeFileSync(t.file, await maker.png(t.ref));
        },
        token: githubToken(),
        yes: values.yes!,
        overwrite: values.overwrite!,
        headless: values.headless!,
        delayMs: Math.max(0, Number(values.delay) || 2000),
        profileDir: values.profile ? resolve(values.profile) : join(homedir(), '.repocard', 'browser'),
        log: info,
        source: maker.source,
      });
      return;
    }

    default:
      fail(`Unknown command "${command}". Run \`repocard --help\`.`);
  }
}

export function run(): void {
  main().catch((err: Error) => fail(err.message));
}
