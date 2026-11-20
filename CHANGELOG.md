# Changelog

## 1.0.0 (2026-11-20)

First release.

- AI-designed social previews: four concepts per repository from a closed design vocabulary
  (6 layouts, 16 palettes, 6 type pairings, 6 backgrounds), with a deterministic fallback.
- Cloudflare Worker serving PNG and SVG cards, JSON API, OpenAPI 3.1, `llms.txt`, and an MCP server.
- Website with generator, fine-tuning, bulk export with ZIP, and docs.
- `repocard` CLI: `card`, `bulk`, `status`, and `apply` (browser-automated upload).
- GitHub Action that keeps `.github/social-preview.png` committed and an optional README banner.
