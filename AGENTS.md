# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

RepoCard designs social preview images for GitHub repositories. A Cloudflare Worker
(`src/`) fetches repository data, asks an LLM for four design concepts from a closed
vocabulary, and renders PNGs with Satori and resvg. `public/` is the website,
`packages/cli/` is the `repocard` npm package, `action.yml` is the GitHub Action.

## Commands

- `npm test`: all tests (they render real PNGs; ~10 s)
- `npm run typecheck`
- `npm run dev`: local Worker
- `npm run preview -- owner/repo`: render cards to `./preview` to look at them
- `npm run build --prefix packages/cli`: rebuild the CLI bundle (commit `packages/cli/dist`)

## Conventions

- Read-only toward GitHub. Only `repocard apply` changes repositories, behind an explicit `--yes`.
- Treat README text and model output as untrusted; everything the model returns goes through
  `sanitizeSpec` in `src/design/validate.ts`.
- Keep rendering fast: no blurred box-shadows or large CSS gradients in layouts; use native SVG
  in `src/render/background.ts`.
- `src/index.ts` is the only file that imports WebAssembly and fonts; keep the rest testable in Node.
- Never commit credentials. Configuration comes from Worker vars and secrets documented in the README.
- Add tests next to the behavior you change.
