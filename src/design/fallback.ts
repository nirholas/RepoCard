import type { RepoData } from '../lib/github';
import { seeded } from '../lib/hash';
import { cleanText, LIMITS } from './validate';
import {
  CONCEPT_COUNT,
  type Background,
  type DesignSet,
  type DesignSpec,
  type FontPair,
  type Layout,
  type PaletteName,
} from './types';

/** Palettes that suit a language's community colors, best first. */
const LANGUAGE_PALETTES: Record<string, PaletteName[]> = {
  TypeScript: ['ocean', 'midnight', 'snow'],
  JavaScript: ['gold', 'obsidian', 'sand'],
  Python: ['ocean', 'gold', 'sky'],
  Rust: ['ember', 'sand', 'crimson'],
  Go: ['ocean', 'aurora', 'sky'],
  Java: ['ember', 'paper', 'crimson'],
  Kotlin: ['nebula', 'midnight', 'blush'],
  Swift: ['ember', 'blush', 'crimson'],
  Ruby: ['crimson', 'blush', 'paper'],
  PHP: ['midnight', 'nebula', 'sky'],
  'C#': ['nebula', 'mint', 'midnight'],
  'C++': ['crimson', 'midnight', 'snow'],
  C: ['obsidian', 'snow', 'terminal'],
  Shell: ['terminal', 'obsidian', 'forest'],
  Solidity: ['nebula', 'midnight', 'obsidian'],
  Vue: ['aurora', 'mint', 'forest'],
  Svelte: ['ember', 'paper', 'crimson'],
  HTML: ['ember', 'paper', 'sand'],
  CSS: ['nebula', 'sky', 'midnight'],
  Dart: ['ocean', 'sky', 'aurora'],
  Elixir: ['nebula', 'blush', 'midnight'],
  Haskell: ['nebula', 'paper', 'midnight'],
  Zig: ['gold', 'sand', 'ember'],
  Lua: ['midnight', 'sky', 'ocean'],
  Nix: ['midnight', 'sky', 'snow'],
  'Jupyter Notebook': ['ember', 'paper', 'gold'],
  MDX: ['gold', 'paper', 'obsidian'],
};

const ALL_DARK: PaletteName[] = ['midnight', 'obsidian', 'aurora', 'ember', 'nebula', 'ocean', 'forest', 'terminal', 'crimson', 'gold'];
const ALL_LIGHT: PaletteName[] = ['paper', 'snow', 'mint', 'blush', 'sand', 'sky'];

const LAYOUT_STYLE: Record<Layout, { fonts: FontPair[]; backgrounds: Background[] }> = {
  spotlight: { fonts: ['modern', 'geometric', 'expressive'], backgrounds: ['aurora', 'dots', 'rings'] },
  split: { fonts: ['geometric', 'friendly', 'modern'], backgrounds: ['grid', 'aurora', 'solid'] },
  editorial: { fonts: ['editorial'], backgrounds: ['solid', 'dots'] },
  terminal: { fonts: ['technical'], backgrounds: ['grid', 'dots'] },
  poster: { fonts: ['expressive', 'geometric'], backgrounds: ['diagonal', 'aurora', 'rings'] },
  minimal: { fonts: ['modern', 'friendly', 'geometric'], backgrounds: ['solid', 'dots', 'grid'] },
};

const LAYOUT_ORDER: Layout[] = ['spotlight', 'split', 'editorial', 'terminal', 'poster', 'minimal'];

function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length) % items.length]!;
}

function firstSentence(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 25 && !/^[-|>]/.test(l) && /[a-z]/i.test(l));
  if (!line) return '';
  const m = line.match(/^(.{20,}?[.!?])(\s|$)/);
  return m ? m[1]! : line;
}

/**
 * Shorten a description to something that reads well on a card: the first
 * sentence, or the clause before a colon or dash, when the whole is too long.
 */
export function conciseTagline(text: string, max = 90): string {
  const t = text
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/\s*\[[^\]]*(\]|$)/g, '')
    .replace(/\s*\((note|see|wip|beta|alpha|deprecated)[^)]*(\)|$)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= max) return t;
  const sentence = t.match(/^(.{20,}?[.!?])(\s|$)/)?.[1];
  if (sentence && sentence.length <= max) return sentence;
  const clause = t.match(/^(.{20,}?)(\s*[:;]\s|\s[–—-]\s|,\s)/)?.[1];
  if (clause && clause.length <= max) return clause;
  return cleanText(t, max);
}

export function fallbackTagline(repo: RepoData): string {
  const fromDescription = conciseTagline(repo.description);
  if (fromDescription) return fromDescription;
  const fromReadme = cleanText(firstSentence(repo.readme), LIMITS.tagline);
  if (fromReadme) return fromReadme;
  return repo.language ? `A ${repo.language} project by ${repo.owner}.` : `An open source project by ${repo.owner}.`;
}

export function fallbackChips(repo: RepoData): string[] {
  const chips = repo.topics
    .filter((t) => t.length <= LIMITS.chip && t.toLowerCase() !== repo.name.toLowerCase())
    .slice(0, LIMITS.chips);
  if (chips.length === 0 && repo.language) chips.push(repo.language.toLowerCase());
  return chips;
}

/** A sensible single spec for a repo, used as the base for sanitizing. */
export function baseSpec(repo: RepoData): DesignSpec {
  return {
    version: 1,
    layout: 'spotlight',
    background: 'aurora',
    palette: LANGUAGE_PALETTES[repo.language ?? '']?.[0] ?? 'midnight',
    font: 'modern',
    mark: 'avatar',
    title: cleanText(repo.name, LIMITS.title),
    tagline: fallbackTagline(repo),
    chips: fallbackChips(repo),
    rationale: 'A clean, centered layout that puts the project name first.',
  };
}

/**
 * Four distinct, deterministic concepts derived from repository metadata.
 * Used when AI is disabled, unavailable, over budget, or returns unusable output.
 */
export function fallbackDesigns(repo: RepoData): DesignSet {
  const rand = seeded(repo.fullName.toLowerCase());
  const base = baseSpec(repo);
  const preferred = LANGUAGE_PALETTES[repo.language ?? ''] ?? [];

  const start = Math.floor(rand() * LAYOUT_ORDER.length);
  const layouts = Array.from({ length: CONCEPT_COUNT }, (_, i) => LAYOUT_ORDER[(start + i) % LAYOUT_ORDER.length]!);

  const used = new Set<PaletteName>();
  const palettes: PaletteName[] = [];
  for (let i = 0; i < CONCEPT_COUNT; i++) {
    // Concept 3 is always light so every set offers both modes.
    const pool = i === 2 ? ALL_LIGHT : [...preferred.filter((p) => ALL_DARK.includes(p)), ...ALL_DARK];
    const candidates = pool.filter((p) => !used.has(p));
    const choice = i < 2 && candidates.length && preferred.includes(candidates[0]!) ? candidates[0]! : pick(candidates.length ? candidates : pool, rand);
    used.add(choice);
    palettes.push(choice);
  }

  const concepts = layouts.map((layout, i): DesignSpec => {
    const style = LAYOUT_STYLE[layout];
    const palette = layout === 'terminal' && i !== 2 ? 'terminal' : palettes[i]!;
    return {
      ...base,
      layout,
      palette,
      font: pick(style.fonts, rand),
      background: pick(style.backgrounds, rand),
      mark: layout === 'poster' || (layout === 'minimal' && rand() > 0.5) ? 'monogram' : 'avatar',
      rationale: `A ${layout} layout in the ${palette} palette, chosen from the repository's language and metadata.`,
    };
  });

  return { repo: repo.fullName, source: 'fallback', generatedAt: new Date().toISOString(), concepts };
}
