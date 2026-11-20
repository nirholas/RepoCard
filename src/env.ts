import type { WorkersAiBinding } from './design/ai';

/** Cloudflare Rate Limiting binding (https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Minimal KV surface used by RepoCard. */
export interface KvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  /** Static site (public/). */
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** Workers AI. Optional: without it RepoCard uses deterministic designs. */
  AI?: WorkersAiBinding;
  /** Design cache. Optional but strongly recommended so designs stay stable. */
  DESIGNS?: KvStore;
  /** Limits uncached renders per client IP. */
  RENDER_LIMITER?: RateLimiter;
  /** Limits AI design generations per client IP. */
  AI_LIMITER?: RateLimiter;

  /** GitHub token (secret). Raises the GitHub API limit from 60 to 5,000 requests per hour. */
  GITHUB_TOKEN?: string;
  /** "workers-ai" (default when AI is bound), "openai-compatible", or "none". */
  AI_PROVIDER?: string;
  /** Workers AI model id. */
  AI_MODEL?: string;
  /** OpenAI-compatible endpoint, e.g. https://api.groq.com/openai/v1 */
  LLM_BASE_URL?: string;
  /** API key for the OpenAI-compatible endpoint (secret). */
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  /** Canonical public origin, e.g. https://repocard.xyz. Defaults to the request origin. */
  PUBLIC_URL?: string;
}

export const DEFAULT_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
