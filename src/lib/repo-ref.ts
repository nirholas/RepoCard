/**
 * Parse anything a person might paste into a canonical owner/repo pair:
 * "owner/repo", "github.com/owner/repo", full https URLs with /tree/... or
 * query strings, "git@github.com:owner/repo.git", and "gh repo clone owner/repo".
 */

export interface RepoRef {
  owner: string;
  repo: string;
}

// GitHub logins: alphanumeric or single hyphens, max 39 chars, no leading/trailing hyphen.
const OWNER = /^(?!-)[a-z0-9-]{1,39}(?<!-)$/i;
// Repository names: letters, digits, '.', '-', '_'; max 100 chars; not "." or "..".
const REPO = /^[a-z0-9._-]{1,100}$/i;

export function isValidOwner(owner: string): boolean {
  return OWNER.test(owner) && !owner.includes('--');
}

export function isValidRepo(repo: string): boolean {
  return REPO.test(repo) && repo !== '.' && repo !== '..';
}

export function parseRepoRef(input: string): RepoRef | null {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s || s.length > 300) return null;

  s = s.replace(/^gh\s+repo\s+(clone|view)\s+/i, '');
  s = s.replace(/^git@github\.com:/i, 'github.com/');
  s = s.replace(/^(git\+)?(https?|ssh|git):\/\/(git@)?/i, '');
  s = s.replace(/^www\./i, '');

  if (/^github\.com\//i.test(s)) {
    s = s.slice('github.com/'.length);
  } else if (/^[^/\s]+\.[a-z]{2,}\//i.test(s)) {
    // Some other host, e.g. gitlab.com/owner/repo.
    return null;
  }

  s = s.split(/[?#]/)[0] ?? '';
  const parts = s.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, '');
  if (!isValidOwner(owner) || !isValidRepo(repo)) return null;
  return { owner, repo };
}

export function formatRepoRef(ref: RepoRef): string {
  return `${ref.owner}/${ref.repo}`;
}
