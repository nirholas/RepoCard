/**
 * Model Context Protocol server over Streamable HTTP (stateless, JSON responses).
 * Lets AI agents generate social previews: POST JSON-RPC 2.0 messages to /mcp.
 */
import { API_NOTE, VERSION, designsPayload, optionsPayload, repoListPayload, settingsUrl, setupSteps } from './cards';
import type { DesignSet } from './design/types';
import { sanitizeSpec } from './design/validate';
import { HttpError } from './lib/errors';
import { CORS_HEADERS, readJson } from './lib/http';
import type { RepoData, RepoSummary } from './lib/github';
import { isValidOwner, parseRepoRef, type RepoRef } from './lib/repo-ref';
import { toBase64 } from './lib/base64';
import { parseCardQuery } from './service';

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export interface McpBackend {
  origin: string;
  designs(ref: RepoRef, refresh: boolean): Promise<{ repo: RepoData; set: DesignSet }>;
  renderPng(ref: RepoRef, params: URLSearchParams): Promise<Uint8Array>;
  listRepos(owner: string, limit: number): Promise<RepoSummary[]>;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const repoProp = { type: 'string', description: 'GitHub repository as owner/repo or any github.com URL.' };
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export const TOOLS = [
  {
    name: 'create_social_preview',
    title: 'Create a social preview image',
    description:
      'Design and render a 1280x640 social preview PNG for a public GitHub repository. Returns the image, a stable URL, and the steps to set it on GitHub. Optional fields override the AI design.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: repoProp,
        variant: { type: 'integer', minimum: 1, maximum: 4, description: 'Which of the 4 AI concepts to render. Default 1.' },
        layout: { type: 'string', enum: ['spotlight', 'split', 'editorial', 'terminal', 'poster', 'minimal'] },
        palette: {
          type: 'string',
          enum: ['midnight', 'obsidian', 'aurora', 'ember', 'nebula', 'ocean', 'forest', 'terminal', 'crimson', 'gold', 'paper', 'snow', 'mint', 'blush', 'sand', 'sky'],
        },
        font: { type: 'string', enum: ['modern', 'geometric', 'technical', 'editorial', 'friendly', 'expressive'] },
        background: { type: 'string', enum: ['aurora', 'grid', 'dots', 'diagonal', 'rings', 'solid'] },
        title: { type: 'string', maxLength: 48 },
        tagline: { type: 'string', maxLength: 110 },
        accent: { type: 'string', description: 'Brand color as hex, e.g. #7c3aed.' },
        include_image: { type: 'boolean', description: 'Return the PNG inline as base64. Default true.' },
      },
      required: ['repo'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'get_design_concepts',
    title: 'Get design concepts',
    description: 'Return the 4 AI-designed concepts for a repository (layout, palette, font, tagline, rationale) with PNG/SVG URLs for each.',
    inputSchema: {
      type: 'object',
      properties: { repo: repoProp, refresh: { type: 'boolean', description: 'Generate new concepts instead of returning stored ones.' } },
      required: ['repo'],
      additionalProperties: false,
    },
    annotations: { ...READ_ONLY, idempotentHint: false },
  },
  {
    name: 'list_account_cards',
    title: 'List cards for every repository of an account',
    description:
      'List public repositories of a GitHub user or organization with a social preview URL and settings link for each. Use for bulk updates.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub user or organization login.' },
        include_forks: { type: 'boolean', description: 'Default false.' },
        include_archived: { type: 'boolean', description: 'Default false.' },
        limit: { type: 'integer', minimum: 1, maximum: 300, description: 'Default 100.' },
      },
      required: ['owner'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'how_to_set_social_preview',
    title: 'How to set a social preview on GitHub',
    description: 'Step-by-step instructions for uploading a social preview image to a GitHub repository, and the options for automating it.',
    inputSchema: { type: 'object', properties: { repo: repoProp }, additionalProperties: false },
    annotations: { ...READ_ONLY, openWorldHint: false },
  },
  {
    name: 'get_design_options',
    title: 'List design options',
    description: 'List every layout, palette, font, background and mark RepoCard supports, and the card URL query parameters.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { ...READ_ONLY, openWorldHint: false },
  },
] as const;

const INSTRUCTIONS = `RepoCard designs social preview images (the image GitHub shows in link previews) for public GitHub repositories.
Typical flow: call create_social_preview with the repository; show the image; give the user the PNG URL and the setup steps.
GitHub has no API for setting the social preview, so the user (or the RepoCard CLI in their own browser) must upload it at github.com/OWNER/REPO/settings.`;

function rpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0' as const, id: id ?? null, error: { code, message } };
}

function textContent(data: unknown) {
  return { type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) };
}

function requireRepo(args: Record<string, unknown>): RepoRef {
  const ref = parseRepoRef(String(args.repo ?? ''));
  if (!ref) throw new HttpError(400, 'bad_request', 'repo must be "owner/repo" or a github.com repository URL.');
  return ref;
}

async function callTool(name: string, args: Record<string, unknown>, backend: McpBackend) {
  switch (name) {
    case 'create_social_preview': {
      const ref = requireRepo(args);
      const params = new URLSearchParams();
      for (const key of ['variant', 'layout', 'palette', 'font', 'background', 'title', 'tagline', 'accent']) {
        if (args[key] !== undefined && args[key] !== null && args[key] !== '') params.set(key, String(args[key]).replace(/^#/, ''));
      }
      parseCardQuery(params, 'png'); // validate early for a clear error
      const { repo, set } = await backend.designs(ref, false);
      const payload = designsPayload(backend.origin, repo, set);
      const variant = Number(params.get('variant') ?? 1);
      const overrides = [...params.keys()].filter((k) => k !== 'variant');
      const qs = new URLSearchParams(params);
      qs.delete('variant');
      const base = payload.concepts[variant - 1]!;
      const design = overrides.length ? sanitizeSpec({ ...base.spec, ...Object.fromEntries(qs) }, base.spec) : base.spec;
      const url = overrides.length ? `${base.png}${base.png.includes('?') ? '&' : '?'}${qs}` : base.png;
      const summary = {
        repository: repo.fullName,
        png: url,
        design,
        source: set.source,
        settingsUrl: settingsUrl(repo.fullName),
        setupSteps: setupSteps(repo.fullName),
        note: API_NOTE,
      };
      const content: unknown[] = [];
      if (args.include_image !== false) {
        const png = await backend.renderPng(ref, params);
        content.push({ type: 'image', data: toBase64(png), mimeType: 'image/png' });
      }
      content.push(textContent(summary));
      return { content, structuredContent: summary };
    }
    case 'get_design_concepts': {
      const ref = requireRepo(args);
      const { repo, set } = await backend.designs(ref, args.refresh === true);
      const payload = designsPayload(backend.origin, repo, set);
      return { content: [textContent(payload)], structuredContent: payload };
    }
    case 'list_account_cards': {
      const owner = String(args.owner ?? '');
      if (!isValidOwner(owner)) throw new HttpError(400, 'bad_request', 'owner must be a GitHub user or organization login.');
      const limit = Math.min(300, Math.max(1, Number(args.limit ?? 100) || 100));
      const repos = (await backend.listRepos(owner, limit)).filter(
        (r) => (args.include_forks === true || !r.fork) && (args.include_archived === true || !r.archived),
      );
      const payload = { ...repoListPayload(backend.origin, owner, repos), note: API_NOTE };
      return { content: [textContent(payload)], structuredContent: payload };
    }
    case 'how_to_set_social_preview': {
      const ref = args.repo ? requireRepo(args) : null;
      const fullName = ref ? `${ref.owner}/${ref.repo}` : 'OWNER/REPO';
      const text = [
        `Set a social preview for ${fullName}:`,
        ...setupSteps(fullName).map((s, i) => `${i + 1}. ${s}`),
        '',
        API_NOTE,
        'Automation options:',
        '- CLI: `npx repocard apply OWNER` uploads cards to every repository in a browser you are logged into (dry run unless --yes).',
        '- GitHub Action: nirholas/RepoCard keeps a generated card committed at .github/social-preview.png and can add it as a README banner.',
      ].join('\n');
      return { content: [textContent(text)] };
    }
    case 'get_design_options':
      return { content: [textContent(optionsPayload())], structuredContent: optionsPayload() };
    default:
      throw new HttpError(404, 'unknown_tool', `Unknown tool: ${name}`);
  }
}

async function handleMessage(msg: JsonRpcRequest, backend: McpBackend): Promise<object | null> {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(msg?.id ?? null, -32600, 'Invalid Request');
  }
  const isNotification = msg.id === undefined;
  try {
    switch (msg.method) {
      case 'initialize': {
        const requested = String(msg.params?.protocolVersion ?? '');
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
        return rpcResult(msg.id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'repocard', title: 'RepoCard', version: VERSION },
          instructions: INSTRUCTIONS,
        });
      }
      case 'ping':
        return isNotification ? null : rpcResult(msg.id, {});
      case 'tools/list':
        return rpcResult(msg.id, { tools: TOOLS });
      case 'tools/call': {
        const name = String(msg.params?.name ?? '');
        const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
        if (!TOOLS.some((t) => t.name === name)) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
        try {
          return rpcResult(msg.id, await callTool(name, args, backend));
        } catch (err) {
          // Tool failures are results with isError, so the model can read and recover.
          const message = err instanceof HttpError ? err.message : 'The tool failed unexpectedly. Please try again.';
          if (!(err instanceof HttpError)) console.error(JSON.stringify({ event: 'mcp_tool_error', tool: name, message: (err as Error).message }));
          return rpcResult(msg.id, { content: [textContent(message)], isError: true });
        }
      }
      default:
        if (isNotification) return null; // e.g. notifications/initialized, notifications/cancelled
        return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  } catch (err) {
    return rpcError(msg.id, -32603, (err as Error).message || 'Internal error');
  }
}

export async function handleMcp(request: Request, backend: McpBackend): Promise<Response> {
  const headers = { ...CORS_HEADERS, 'content-type': 'application/json' };
  if (request.method === 'GET' || request.method === 'DELETE') {
    // Stateless server: no server-initiated stream and no sessions to end.
    return new Response(JSON.stringify(rpcError(null, -32000, 'Use POST for MCP requests.')), {
      status: 405,
      headers: { ...headers, allow: 'POST, OPTIONS' },
    });
  }
  let body: unknown;
  try {
    body = await readJson(request, 256 * 1024);
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, 'Parse error')), { status: 400, headers });
  }
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as JsonRpcRequest[];
  if (!messages.length) return new Response(JSON.stringify(rpcError(null, -32600, 'Invalid Request')), { status: 400, headers });

  const responses = (await Promise.all(messages.map((m) => handleMessage(m, backend)))).filter((r) => r !== null);
  if (!responses.length) return new Response(null, { status: 202, headers: CORS_HEADERS });
  return new Response(JSON.stringify(batch ? responses : responses[0]), { status: 200, headers });
}
