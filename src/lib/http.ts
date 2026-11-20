import { HttpError } from './errors';

export const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, mcp-session-id, mcp-protocol-version',
  'access-control-expose-headers': 'x-repocard-source, x-repocard-variant, retry-after, mcp-session-id',
  'access-control-max-age': '86400',
};

export const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

export function withHeaders(res: Response, headers: Record<string, string>): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

export function json(data: unknown, init: ResponseInit & { cache?: string } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  if (!headers.has('cache-control')) headers.set('cache-control', init.cache ?? 'no-store');
  for (const [k, v] of Object.entries({ ...CORS_HEADERS, ...SECURITY_HEADERS })) headers.set(k, v);
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

export function text(body: string, contentType: string, cache = 'public, max-age=3600'): Response {
  return new Response(body, {
    headers: { 'content-type': contentType, 'cache-control': cache, ...CORS_HEADERS, ...SECURITY_HEADERS },
  });
}

export function errorJson(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message } }, { status: err.status, headers: err.headers });
  }
  console.error(JSON.stringify({ event: 'unhandled_error', message: (err as Error)?.message, stack: (err as Error)?.stack }));
  return json({ error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } }, { status: 500 });
}

export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
}

/** Read a JSON request body with a size cap. */
export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > maxBytes) throw new HttpError(413, 'payload_too_large', 'Request body is too large.');
  const raw = await request.text();
  if (raw.length > maxBytes) throw new HttpError(413, 'payload_too_large', 'Request body is too large.');
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
}
