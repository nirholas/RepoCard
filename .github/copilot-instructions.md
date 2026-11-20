# Copilot instructions

Read [AGENTS.md](../AGENTS.md) first; it is the source of truth for working in this repository.

Key points:

- Run `npm run typecheck && npm test` before proposing changes. Tests render real PNGs.
- Everything the LLM returns goes through `sanitizeSpec` (`src/design/validate.ts`); never render raw model output.
- Layouts must stay fast to rasterize: no blurred `box-shadow` or large CSS gradients; draw backgrounds as native SVG.
- The service is read-only toward GitHub. Only `repocard apply` changes repositories, behind `--yes`.
- After changing the CLI, rebuild with `npm run build --prefix packages/cli` and commit `packages/cli/dist`.
- After changing `src/llms.ts`, run `npm run llms:sync`.
