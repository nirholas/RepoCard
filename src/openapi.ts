import { VERSION } from './cards';
import { BACKGROUNDS, FONTS, LAYOUTS, MARKS, PALETTE_NAMES } from './design/types';

export function openApiDocument(origin: string) {
  const ownerParam = { name: 'owner', in: 'path', required: true, schema: { type: 'string' }, description: 'GitHub user or organization.' };
  const repoParam = { name: 'repo', in: 'path', required: true, schema: { type: 'string' }, description: 'Repository name.' };
  const q = (name: string, schema: object, description: string) => ({ name, in: 'query', required: false, schema, description });
  const error = {
    description: 'Error',
    content: {
      'application/json': {
        schema: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'RepoCard API',
      version: VERSION,
      description:
        'AI-designed social preview images for GitHub repositories. Read-only: RepoCard never writes to GitHub. ' +
        'Agents can also use the MCP endpoint at /mcp.',
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: origin }],
    paths: {
      '/card/{owner}/{repo}.png': {
        get: {
          operationId: 'getCardPng',
          summary: 'Render a social preview as PNG (1280x640).',
          parameters: [
            ownerParam,
            repoParam,
            q('variant', { type: 'integer', minimum: 1, maximum: 4, default: 1 }, 'Which AI concept to render.'),
            q('layout', { type: 'string', enum: LAYOUTS }, 'Override the layout.'),
            q('palette', { type: 'string', enum: PALETTE_NAMES }, 'Override the palette.'),
            q('font', { type: 'string', enum: FONTS }, 'Override the font pairing.'),
            q('background', { type: 'string', enum: BACKGROUNDS }, 'Override the background.'),
            q('mark', { type: 'string', enum: MARKS }, 'Override the mark.'),
            q('emoji', { type: 'string' }, 'Emoji used with mark=emoji.'),
            q('accent', { type: 'string', pattern: '^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$' }, 'Brand color.'),
            q('title', { type: 'string', maxLength: 48 }, 'Override the title.'),
            q('tagline', { type: 'string', maxLength: 110 }, 'Override the tagline.'),
            q('chips', { type: 'string' }, 'Comma-separated keywords.'),
            q('stats', { type: 'string', enum: ['0', '1'] }, '0 hides repository stats.'),
            q('owner', { type: 'string', enum: ['0', '1'] }, '0 hides the owner.'),
            q('mode', { type: 'string', enum: ['auto', 'fast'] }, 'fast never calls the LLM.'),
          ],
          responses: {
            '200': { description: 'PNG image', content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } },
            '4XX': { description: 'An error card (PNG) describing the problem', content: { 'image/png': {} } },
          },
        },
      },
      '/card/{owner}/{repo}.svg': {
        get: {
          operationId: 'getCardSvg',
          summary: 'Render a social preview as SVG. Accepts the same parameters as the PNG endpoint.',
          parameters: [ownerParam, repoParam],
          responses: { '200': { description: 'SVG image', content: { 'image/svg+xml': {} } } },
        },
      },
      '/api/v1/cards/{owner}/{repo}': {
        get: {
          operationId: 'getDesigns',
          summary: 'Get the 4 design concepts for a repository, with image URLs and setup steps.',
          parameters: [ownerParam, repoParam],
          responses: { '200': { description: 'Design concepts' }, '404': error, '429': error },
        },
      },
      '/api/v1/cards': {
        post: {
          operationId: 'createDesigns',
          summary: 'Create (or refresh) design concepts from any repository URL.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['repo'],
                  properties: { repo: { type: 'string', description: 'owner/repo or github.com URL' }, refresh: { type: 'boolean' } },
                },
              },
            },
          },
          responses: { '200': { description: 'Design concepts' }, '400': error, '404': error, '429': error },
        },
      },
      '/api/v1/users/{owner}/repos': {
        get: {
          operationId: 'listAccountCards',
          summary: 'List public repositories for an account with card URLs and settings links.',
          parameters: [
            ownerParam,
            q('forks', { type: 'string', enum: ['0', '1'] }, 'Include forks. Default 0.'),
            q('archived', { type: 'string', enum: ['0', '1'] }, 'Include archived repositories. Default 0.'),
            q('limit', { type: 'integer', minimum: 1, maximum: 300 }, 'Default 100.'),
          ],
          responses: { '200': { description: 'Repositories' }, '404': error },
        },
      },
      '/api/v1/options': { get: { operationId: 'getOptions', summary: 'List all design options.', responses: { '200': { description: 'Options' } } } },
      '/api/v1/health': { get: { operationId: 'health', summary: 'Health check.', responses: { '200': { description: 'OK' } } } },
      '/mcp': {
        post: {
          operationId: 'mcp',
          summary: 'Model Context Protocol endpoint (Streamable HTTP, JSON-RPC 2.0).',
          requestBody: { required: true, content: { 'application/json': {} } },
          responses: { '200': { description: 'JSON-RPC response' }, '202': { description: 'Notification accepted' } },
        },
      },
    },
  };
}
