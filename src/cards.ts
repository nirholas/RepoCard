import { BACKGROUNDS, FONTS, LAYOUTS, MARKS, PALETTE_NAMES, type DesignSet } from './design/types';
import { PALETTES } from './design/palettes';
import type { RepoData, RepoSummary } from './lib/github';
import { fnv1a } from './lib/hash';

export const VERSION = '1.0.0';

/** Short revision token so image URLs change when designs are regenerated. */
export function revision(set: Pick<DesignSet, 'generatedAt'>): string {
  return fnv1a(set.generatedAt).toString(36);
}

export function cardUrl(origin: string, fullName: string, variant: number, opts: { format?: 'png' | 'svg'; rev?: string } = {}): string {
  const params = new URLSearchParams();
  if (variant !== 1) params.set('variant', String(variant));
  if (opts.rev) params.set('rev', opts.rev);
  const qs = params.toString();
  return `${origin}/card/${fullName}.${opts.format ?? 'png'}${qs ? `?${qs}` : ''}`;
}

export function settingsUrl(fullName: string): string {
  return `https://github.com/${fullName}/settings`;
}

export function setupSteps(fullName: string): string[] {
  return [
    'Download the PNG (1280x640, under 1 MB, which is what GitHub recommends).',
    `Open ${settingsUrl(fullName)} (you need admin access to the repository).`,
    'In the "Social preview" section near the top of the General settings, click "Edit" and choose "Upload an image...".',
    'Select the downloaded PNG. GitHub saves it immediately; link previews on X, Slack, Discord and LinkedIn use it from then on (some platforms cache old previews for a few days).',
  ];
}

export const API_NOTE =
  'GitHub has no public API for setting a repository social preview, so the final upload is done in the web UI. ' +
  'The RepoCard CLI can automate that upload in your own logged-in browser for many repositories at once.';

export function designsPayload(origin: string, repo: RepoData, set: DesignSet) {
  const rev = revision(set);
  return {
    repository: {
      fullName: repo.fullName,
      url: `https://github.com/${repo.fullName}`,
      description: repo.description,
      stars: repo.stars,
      forks: repo.forks,
      language: repo.language,
      license: repo.license,
      topics: repo.topics,
    },
    source: set.source,
    model: set.model ?? null,
    generatedAt: set.generatedAt,
    concepts: set.concepts.map((spec, i) => {
      const png = cardUrl(origin, repo.fullName, i + 1, { rev });
      return {
        variant: i + 1,
        spec,
        png,
        svg: cardUrl(origin, repo.fullName, i + 1, { rev, format: 'svg' }),
        markdown: `![${repo.fullName}](${png})`,
        html: `<img src="${png}" alt="${repo.fullName}" width="1280" height="640">`,
      };
    }),
    setup: { settingsUrl: settingsUrl(repo.fullName), steps: setupSteps(repo.fullName), note: API_NOTE },
  };
}

export function repoListPayload(origin: string, owner: string, repos: RepoSummary[]) {
  return {
    owner,
    count: repos.length,
    repositories: repos.map((r) => ({
      ...r,
      url: `https://github.com/${r.fullName}`,
      settingsUrl: settingsUrl(r.fullName),
      png: cardUrl(origin, r.fullName, 1),
      fastPng: `${cardUrl(origin, r.fullName, 1)}?mode=fast`,
    })),
  };
}

export function optionsPayload() {
  return {
    variants: [1, 2, 3, 4],
    layouts: LAYOUTS,
    backgrounds: BACKGROUNDS,
    fonts: FONTS,
    marks: MARKS,
    palettes: PALETTE_NAMES.map((name) => ({ name, ...PALETTES[name] })),
    query: {
      variant: 'Concept number, 1-4. Default 1.',
      layout: LAYOUTS.join(' | '),
      palette: PALETTE_NAMES.join(' | '),
      font: FONTS.join(' | '),
      background: BACKGROUNDS.join(' | '),
      mark: MARKS.join(' | '),
      emoji: 'A single emoji, used with mark=emoji.',
      accent: 'Hex brand color without #, e.g. 7c3aed. Adjusted automatically if it would be illegible.',
      title: 'Override the title (max 48 characters).',
      tagline: 'Override the tagline (max 110 characters).',
      chips: 'Comma-separated keywords (max 3).',
      stats: '0 to hide stars, forks, language and license.',
      owner: '0 to hide the owner name.',
      mode: 'fast skips AI and uses cached or deterministic designs.',
    },
  };
}
