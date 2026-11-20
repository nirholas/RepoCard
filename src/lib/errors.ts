/** Errors that map to a specific HTTP status and a stable machine-readable code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string) => new HttpError(400, 'bad_request', message);
export const notFound = (message: string) => new HttpError(404, 'not_found', message);
export const rateLimited = (message: string, retryAfter = 60) =>
  new HttpError(429, 'rate_limited', message, { 'retry-after': String(retryAfter) });
export const upstream = (message: string) => new HttpError(502, 'upstream_error', message);
