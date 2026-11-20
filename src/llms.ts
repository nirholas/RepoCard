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
