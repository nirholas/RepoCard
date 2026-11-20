import { toBase64 } from './base64';

const ALLOWED_HOSTS = new Set(['avatars.githubusercontent.com']);
const MAX_BYTES = 1_000_000;

/**
 * Fetch a GitHub avatar as a data: URI at a size suitable for cards.
 * Only GitHub's avatar host is allowed, so this cannot be used to fetch arbitrary URLs.
 */
export async function fetchAvatar(url: string, fetcher: typeof fetch = (i, init) => fetch(i, init)): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) return null;
  u.searchParams.set('s', '400');
  try {
    const res = await fetcher(u.toString());
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (!['image/png', 'image/jpeg'].includes(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return null;
    return `data:${type};base64,${toBase64(bytes)}`;
  } catch {
    return null;
  }
}
