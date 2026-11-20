/**
 * The design vocabulary RepoCard renders. An LLM (or the deterministic
 * fallback) chooses values from these closed sets; free-form values are
 * limited to short text and validated hex colors so every card stays legible.
 */

export const LAYOUTS = ['spotlight', 'split', 'editorial', 'terminal', 'poster', 'minimal'] as const;
export type Layout = (typeof LAYOUTS)[number];

export const BACKGROUNDS = ['aurora', 'grid', 'dots', 'diagonal', 'rings', 'solid'] as const;
export type Background = (typeof BACKGROUNDS)[number];

export const FONTS = ['modern', 'geometric', 'technical', 'editorial', 'friendly', 'expressive'] as const;
export type FontPair = (typeof FONTS)[number];

export const MARKS = ['avatar', 'monogram', 'emoji', 'none'] as const;
export type MarkKind = (typeof MARKS)[number];

export const PALETTE_NAMES = [
  'midnight',
  'obsidian',
  'aurora',
  'ember',
  'nebula',
  'ocean',
  'forest',
  'terminal',
  'crimson',
  'gold',
  'paper',
  'snow',
  'mint',
  'blush',
  'sand',
  'sky',
] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];

export interface Palette {
  mode: 'dark' | 'light';
  /** Canvas background. */
  bg: string;
  /** Secondary background used for gradients and panels. */
  bg2: string;
  /** Primary text. Must reach 7:1 against bg. */
  fg: string;
  /** Secondary text. Must reach 4.5:1 against bg. */
  muted: string;
  /** Brand color. Must reach 3:1 against bg. */
  accent: string;
  /** Supporting color for gradients and decoration. */
  accent2: string;
}

export interface DesignSpec {
  /** Bump when the shape changes so cached specs are regenerated. */
  version: 1;
  layout: Layout;
  background: Background;
  palette: PaletteName;
  /** Optional brand accent that overrides the palette accent when legible. */
  accent?: string;
  font: FontPair;
  mark: MarkKind;
  /** A single emoji, used when mark is "emoji". */
  emoji?: string;
  /** Display title. Usually the repository name. */
  title: string;
  /** One line that says what the project does. */
  tagline: string;
  /** Up to three short keywords. */
  chips: string[];
  /** One sentence explaining the design choice, shown to humans and agents. */
  rationale: string;
}

export interface DesignSet {
  repo: string;
  source: 'ai' | 'fallback';
  model?: string;
  generatedAt: string;
  concepts: DesignSpec[];
}

/** Display options that are not part of the design itself. */
export interface RenderOptions {
  showStats: boolean;
  showOwner: boolean;
}

export const CONCEPT_COUNT = 4;
