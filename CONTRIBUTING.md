# Contributing to RepoCard

Thanks for helping! Bug reports, design ideas, new layouts and palettes are all welcome.

## Setup

Requires Node.js 20 or later.

```bash
npm install
npm run dev        # local Worker on http://localhost:8787 (AI falls back to deterministic designs without a Cloudflare login)
npm test           # Vitest: unit, API, MCP and real rendering tests
npm run typecheck
```

Create `.dev.vars` (git-ignored) with `GITHUB_TOKEN=...` to avoid GitHub's anonymous rate limit locally.

## Working on designs

```bash
npm run preview -- vercel/next.js                 # four concepts per repo → ./preview
npm run preview -- --matrix sindresorhus/awesome  # every layout × sample palettes
```

Set `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` to preview AI designs through any OpenAI-compatible API.

Guidelines for visual changes:

- Check both a dark and a light palette, a long repository name, no description, and no topics.
- Keep render time low. Avoid `box-shadow` blur and large CSS gradients in layouts; draw
  backgrounds and glows as native SVG in `src/render/background.ts` or `LAYOUT_DECOR`.
- New palettes must pass the contrast test in `test/unit.test.ts`.

## Pull requests

- Keep changes focused, with tests next to the behavior they change.
- Run `npm run typecheck && npm test` before opening a PR.
- Use conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- If you touch the CLI, run `npm run build --prefix packages/cli` and commit `packages/cli/dist`,
  because the GitHub Action runs the built CLI directly.

## Project layout

See the "Development" section of the [README](README.md#development).
