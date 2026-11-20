/**
 * Discovery documents for crawlers, AI agents and security researchers:
 * robots.txt, sitemap.xml and /.well-known/* (security.txt, MCP server card,
 * RFC 9727 API catalog, and the legacy ai-plugin.json manifest).
 */
import { VERSION } from './cards';
import { TOOLS } from './mcp';

const DESCRIPTION =
  'AI-designed social preview images for GitHub repositories. Paste a repository link and get a unique 1280x640 PNG. Read-only; never writes to GitHub.';
const REPO = 'https://github.com/nirholas/RepoCard';

export function robotsTxt(origin: string): string {
  return `# RepoCard
User-agent: *
Allow: /
Disallow: /api/
Allow: /api/v1/options

Sitemap: ${origin}/sitemap.xml

# AI agents: see ${origin}/llms.txt and the MCP server at ${origin}/mcp
`;
}

export function sitemapXml(origin: string): string {
  const pages: [string, string, string][] = [
    ['/', 'weekly', '1.0'],
    ['/bulk/', 'monthly', '0.8'],
    ['/docs/', 'weekly', '0.9'],
    ['/llms.txt', 'monthly', '0.5'],
    ['/llms-full.txt', 'monthly', '0.4'],
  ];
  const urls = pages
    .map(([path, freq, priority]) => `  <url><loc>${origin}${path}</loc><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** RFC 9116 security.txt. Expires one year from the given date. */
export function securityTxt(origin: string, now = new Date()): string {
  const expires = new Date(now.getTime() + 365 * 24 * 3600 * 1000);
  expires.setUTCHours(0, 0, 0, 0);
  return `Contact: ${REPO}/security/advisories/new
Expires: ${expires.toISOString()}
Policy: ${REPO}/blob/main/SECURITY.md
Preferred-Languages: en
Canonical: ${origin}/.well-known/security.txt
`;
}

/** MCP server card: where the server lives and what it offers, before connecting. */
export function mcpServerCard(origin: string) {
  return {
    $schema: 'https://modelcontextprotocol.io/schemas/server-card.json',
    name: 'repocard',
    title: 'RepoCard',
    version: VERSION,
    description: DESCRIPTION,
    websiteUrl: origin,
    repository: { url: REPO, source: 'github' },
    documentation: `${origin}/docs/#agents`,
    remotes: [{ type: 'streamable-http', url: `${origin}/mcp` }],
    authentication: { required: false },
    capabilities: { tools: { listChanged: false } },
    tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description })),
    license: 'MIT',
  };
}

/** RFC 9727 API catalog (application/linkset+json). */
export function apiCatalog(origin: string) {
  return {
    linkset: [
      {
        anchor: `${origin}/api/v1`,
        'service-desc': [{ href: `${origin}/openapi.json`, type: 'application/vnd.oai.openapi+json' }],
        'service-doc': [{ href: `${origin}/docs/#api`, type: 'text/html' }],
        status: [{ href: `${origin}/api/v1/health`, type: 'application/json' }],
      },
      {
        anchor: `${origin}/mcp`,
        'service-desc': [{ href: `${origin}/.well-known/mcp.json`, type: 'application/json' }],
        'service-doc': [{ href: `${origin}/docs/#agents`, type: 'text/html' }],
      },
    ],
  };
}

/** Legacy OpenAI plugin manifest, still read by some agent frameworks. */
export function aiPluginManifest(origin: string) {
  return {
    schema_version: 'v1',
    name_for_human: 'RepoCard',
    name_for_model: 'repocard',
    description_for_human: 'AI-designed social preview images for GitHub repositories.',
    description_for_model:
      'Create social preview images (Open Graph images) for public GitHub repositories. Use GET /api/v1/cards/{owner}/{repo} for four design concepts with PNG URLs, or GET /card/{owner}/{repo}.png for the image. GitHub has no API to set the social preview; tell the user to upload it at https://github.com/{owner}/{repo}/settings under "Social preview".',
    auth: { type: 'none' },
    api: { type: 'openapi', url: `${origin}/openapi.json` },
    logo_url: `${origin}/icon-512.png`,
    legal_info_url: `${REPO}/blob/main/LICENSE`,
  };
}
