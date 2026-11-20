export function llmsTxt(origin: string): string {
  return `# RepoCard

> AI-designed social preview images for GitHub repositories. Paste a repository link and get a 1280x640 PNG that fits the project. Read-only: RepoCard never writes to GitHub.

## Use it

- Image: GET ${origin}/card/{owner}/{repo}.png (add ?variant=1..4 for the four AI concepts)
- SVG: GET ${origin}/card/{owner}/{repo}.svg
- Concepts as JSON: GET ${origin}/api/v1/cards/{owner}/{repo}
- Every repository of an account: GET ${origin}/api/v1/users/{owner}/repos
- Design options: GET ${origin}/api/v1/options
- OpenAPI: ${origin}/openapi.json

## For AI agents

- MCP server (Streamable HTTP): ${origin}/mcp
  Tools: create_social_preview, get_design_concepts, list_account_cards, how_to_set_social_preview, get_design_options
- Claude Code: claude mcp add --transport http repocard ${origin}/mcp

## Setting the image on GitHub

GitHub has no public API for the social preview. Upload the PNG at https://github.com/{owner}/{repo}/settings under "Social preview".
The RepoCard CLI (npx repocard apply {owner}) automates the upload for many repositories in the user's own logged-in browser.

## Docs

- Guide: ${origin}/docs/
- Source: https://github.com/nirholas/RepoCard
`;
}

/** Expanded single-file reference for agents that want everything in one fetch. */
export function llmsFullTxt(origin: string): string {
  return `${llmsTxt(origin)}
---

# RepoCard: full reference

RepoCard designs the social preview image (Open Graph image) for public GitHub repositories:
the picture shown when a repository link is shared on X, LinkedIn, Slack, Discord or iMessage.
An LLM reads the repository's description, README, topics and languages and chooses four
design concepts from a closed vocabulary; code renders each concept to a 1280x640 PNG under 1 MB.

## When to use RepoCard

- A user asks for a social preview, Open Graph image, link preview image, or repository banner.
- A user wants every repository of an account to have a consistent, good-looking preview.
- A README needs a header image that matches the project.

## Card URL

GET ${origin}/card/{owner}/{repo}.png
GET ${origin}/card/{owner}/{repo}.svg

Query parameters (all optional):
- variant: 1-4, which AI concept (default 1)
- layout: spotlight | split | editorial | terminal | poster | minimal
- palette: midnight | obsidian | aurora | ember | nebula | ocean | forest | terminal | crimson | gold | paper | snow | mint | blush | sand | sky
- font: modern | geometric | technical | editorial | friendly | expressive
- background: aurora | grid | dots | diagonal | rings | solid
- mark: avatar | monogram | emoji | none (emoji=<one emoji> with mark=emoji)
- accent: hex color without #, adjusted automatically for legibility
- title (max 48 chars), tagline (max 110 chars), chips (comma-separated, max 3)
- stats=0 hides stars/forks/language/license; owner=0 hides the owner
- mode=fast never calls the LLM

Errors return a PNG that explains the problem, with status 400, 404, 429 or 503.

## JSON API

- GET ${origin}/api/v1/cards/{owner}/{repo}: four concepts. Each has variant, spec (layout,
  palette, font, background, mark, title, tagline, chips, rationale), png, svg, markdown and html,
  plus setup.settingsUrl and setup.steps.
- POST ${origin}/api/v1/cards with {"repo": "<owner/repo or any github.com URL>", "refresh": true}
  generates new concepts.
- GET ${origin}/api/v1/users/{owner}/repos?forks=0&archived=0&limit=100: every public repository
  with png, settingsUrl and url.
- GET ${origin}/api/v1/options: the full vocabulary.
- OpenAPI 3.1: ${origin}/openapi.json. API catalog (RFC 9727): ${origin}/.well-known/api-catalog

## MCP server

Endpoint: ${origin}/mcp (Streamable HTTP, JSON-RPC 2.0, stateless, no authentication).
Server card: ${origin}/.well-known/mcp.json

Tools:
- create_social_preview {repo, variant?, layout?, palette?, font?, background?, title?, tagline?, accent?, include_image?}
  returns the PNG inline (base64), the URL, the design and setup steps.
- get_design_concepts {repo, refresh?}
- list_account_cards {owner, include_forks?, include_archived?, limit?}
- how_to_set_social_preview {repo?}
- get_design_options {}

Install:
- Claude Code: claude mcp add --transport http repocard ${origin}/mcp
- Cursor: {"mcpServers": {"repocard": {"url": "${origin}/mcp"}}}
- VS Code: {"servers": {"repocard": {"type": "http", "url": "${origin}/mcp"}}}
- stdio clients: npx -y mcp-remote ${origin}/mcp

## Setting the image on GitHub

GitHub has no public API to set a repository's social preview (GraphQL can read
openGraphImageUrl and usesCustomOpenGraphImage, nothing can write them). Tell the user:
1. Download the PNG.
2. Open https://github.com/{owner}/{repo}/settings (admin access required).
3. Under "Social preview", click Edit, then "Upload an image...", and choose the PNG.

Automation options:
- CLI: npx repocard apply {owner} (dry run) then --yes to upload through the user's own
  logged-in browser. Keeps existing custom previews unless --overwrite.
- GitHub Action: uses: nirholas/RepoCard@v1 keeps .github/social-preview.png committed and can
  add a README banner (readme-banner: true).

## CLI (npm: repocard)

- npx repocard card <owner/repo> [-o file] [--variant n] [--layout ...] [--palette ...]
- npx repocard bulk <owner> [-o dir] [--forks] [--archived]
- npx repocard status <owner>
- npx repocard apply <owner|owner/repo...> [--yes] [--overwrite] [--headless]

## Guarantees

- Read-only toward GitHub. The service never writes to GitHub or asks for account access.
- README text is treated as untrusted input; model output is limited to enums and short cleaned text.
- Every palette meets WCAG contrast; repository names are never rewritten by the model.

Source: https://github.com/nirholas/RepoCard (MIT)
`;
}

/** Canonical public deployment, used for the copies committed to the repository. */
export const REPO_ORIGIN = 'https://repocard.xyz';

const CODEBASE = `
## Codebase (for coding agents)

- src/design/: design vocabulary (types.ts), palettes and contrast (palettes.ts, color.ts, validate.ts), LLM art director (ai.ts), deterministic fallback (fallback.ts)
- src/render/: Satori layouts (layouts.ts, components.ts), native SVG backgrounds (background.ts), fonts (fonts.ts, font-files/), engine (engine.ts)
- src/lib/: repo link parsing (repo-ref.ts), read-only GitHub client (github.ts), HTTP helpers
- src/app.ts routes, src/service.ts caching and designs, src/mcp.ts MCP server, src/discovery.ts robots/sitemap/.well-known, src/index.ts Worker entry
- public/: website (generator, bulk export, docs)
- packages/cli/: the repocard npm package; action.yml: the GitHub Action
- test/: Vitest suites (npm test), npm run typecheck, npm run preview -- owner/repo renders cards locally
- Guidance for agents: AGENTS.md
`;

/** llms.txt committed at the repository root: the site summary plus a codebase map. */
export function repoLlmsTxt(origin: string): string {
  return llmsTxt(origin) + CODEBASE;
}

export function repoLlmsFullTxt(origin: string): string {
  return llmsFullTxt(origin) + CODEBASE;
}
