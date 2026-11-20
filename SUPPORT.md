# Getting help

- **How do I…?** Start with the [docs](https://repocard.xyz/docs/) and the [README](README.md).
- **Found a bug?** [Open an issue](https://github.com/nirholas/RepoCard/issues/new/choose) with the
  repository or card URL and what you expected.
- **Have an idea for a layout, palette or integration?** Open a feature request.
- **Security problem?** Report it privately; see [SECURITY.md](SECURITY.md).

Common fixes:

| Symptom | Fix |
|---|---|
| "Repository not found" | The repository is private, renamed, or misspelled. Only public repositories work. |
| "Too many requests" | New renders are rate limited per IP. Wait a minute; cached cards keep working. |
| "Designed from metadata" badge | The AI was busy. Click **New concepts** later. |
| Old image still shows on X/LinkedIn | Platforms cache link previews for days; use their refresh tools. |
| `repocard apply` can't find the upload control | GitHub may have changed its settings page. Upload the printed PNG by hand and open an issue. |
