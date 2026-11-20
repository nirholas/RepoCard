# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/nirholas/RepoCard/security/advisories/new).
Do not open a public issue for security problems.

Include what you found, how to reproduce it, and the impact you expect. You should get a
response within a few days. Once a fix ships, we're happy to credit you in the advisory.

## Scope

In scope:

- The RepoCard Worker (`src/`): routes, MCP server, caching, rate limiting, rendering.
- The web UI (`public/`).
- The `repocard` CLI (`packages/cli/`), including `repocard apply`.
- The GitHub Action (`action.yml`, `action/`).

Examples of issues we care about: server-side request forgery, prompt injection that escapes
the design vocabulary, script execution through rendered SVGs, cache poisoning, rate-limit
bypasses with real impact, credential exposure, and script injection in the Action.

## Design notes

- RepoCard is read-only toward GitHub. The service never writes to GitHub and never asks
  for account access. Only `repocard apply` changes repositories, and only in a browser the
  user signs into themselves, after an explicit `--yes`.
- README text is treated as untrusted model input. Model output is restricted to closed
  enums plus short, cleaned text.
- Outbound image fetches are limited to `avatars.githubusercontent.com`; emoji and fallback
  fonts come from fixed hosts.
- SVG responses are served with a restrictive `Content-Security-Policy`.
- Secrets (`GITHUB_TOKEN`, `LLM_API_KEY`) are Worker secrets and are never logged or
  returned.
