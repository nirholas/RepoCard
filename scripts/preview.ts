/**
 * Render cards locally with Node, without Cloudflare. Useful for design work.
 *
 *   npm run preview -- vercel/next.js denoland/deno          # 4 concepts per repo
 *   npm run preview -- --matrix sindresorhus/got             # every layout x palette sample
 *
 * Uses deterministic designs unless LLM_BASE_URL, LLM_API_KEY and LLM_MODEL are
 * set (any OpenAI-compatible endpoint). Set GITHUB_TOKEN to avoid rate limits.
 * Output goes to ./preview (git-ignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { satori } from '@cf-wasm/satori/node';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiDesigns, OpenAiCompatibleProvider } from '../src/design/ai';
import { fallbackDesigns } from '../src/design/fallback';
import { LAYOUTS, PALETTE_NAMES, type DesignSpec } from '../src/design/types';
import { fetchAvatar } from '../src/lib/avatar';
import { GitHubClient } from '../src/lib/github';
import { parseRepoRef } from '../src/lib/repo-ref';
import { RenderEngine } from '../src/render/engine';
import { FONT_MANIFEST } from '../src/render/fonts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const out = join(root, 'preview');
mkdirSync(out, { recursive: true });

const engine = new RenderEngine({
  satori: satori as never,
  resvg: readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')),
  fonts: FONT_MANIFEST.map((f) => {
    const buf = readFileSync(join(root, 'src/render/font-files', f.file));
    return { name: f.name, weight: f.weight, style: f.style, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  }),
});

const args = process.argv.slice(2);
const matrix = args.includes('--matrix');
const repos = args.filter((a: string) => !a.startsWith('--'));
if (!repos.length) {
  console.error('Usage: npm run preview -- [--matrix] owner/repo [...]');
  process.exit(1);
}

const github = new GitHubClient({ token: process.env.GITHUB_TOKEN });
const llm =
  process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL
    ? new OpenAiCompatibleProvider(process.env.LLM_BASE_URL, process.env.LLM_API_KEY, process.env.LLM_MODEL)
    : null;

for (const input of repos) {
  const ref = parseRepoRef(input);
  if (!ref) throw new Error(`Not a repository: ${input}`);
  const repo = await github.getRepo(ref);
  const avatar = await fetchAvatar(repo.avatarUrl);
  const set = llm ? await aiDesigns(repo, llm) : fallbackDesigns(repo);
  const slug = repo.fullName.replace('/', '__');

  let specs: DesignSpec[] = set.concepts;
  if (matrix) {
    specs = LAYOUTS.flatMap((layout, i) =>
      [PALETTE_NAMES[(i * 3) % 16]!, PALETTE_NAMES[10 + (i % 6)]!].map((palette) => ({ ...set.concepts[0]!, layout, palette })),
    );
  }

  for (const [i, spec] of specs.entries()) {
    const started = performance.now();
    const png = await engine.png({
      spec,
      repo: { owner: repo.owner, name: repo.name, stars: repo.stars, forks: repo.forks, language: repo.language, license: repo.license },
      avatar,
      options: { showStats: true, showOwner: true },
    });
    const file = join(out, `${slug}-${i + 1}-${spec.layout}-${spec.palette}.png`);
    writeFileSync(file, png);
    console.log(`${file}  ${(png.byteLength / 1024).toFixed(0)} KB  ${(performance.now() - started).toFixed(0)} ms  [${set.source}]`);
  }
}
