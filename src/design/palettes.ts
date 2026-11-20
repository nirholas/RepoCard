import type { Palette, PaletteName } from './types';

/**
 * Curated palettes. The model picks one by name and may supply a brand accent;
 * it never invents the whole scheme, which is what keeps results tasteful.
 * test/palettes.test.ts enforces the contrast floors documented on Palette.
 */
export const PALETTES: Record<PaletteName, Palette> = {
  midnight: { mode: 'dark', bg: '#0b1020', bg2: '#18214a', fg: '#f5f7ff', muted: '#a3add0', accent: '#7c9cff', accent2: '#c084fc' },
  obsidian: { mode: 'dark', bg: '#0a0a0a', bg2: '#1f1f1f', fg: '#fafafa', muted: '#a3a3a3', accent: '#e5e5e5', accent2: '#737373' },
  aurora: { mode: 'dark', bg: '#051a19', bg2: '#0c3532', fg: '#ecfdf5', muted: '#94c2b6', accent: '#34d399', accent2: '#22d3ee' },
  ember: { mode: 'dark', bg: '#190b07', bg2: '#3a160c', fg: '#fff7ed', muted: '#d9ad94', accent: '#fb923c', accent2: '#f43f5e' },
  nebula: { mode: 'dark', bg: '#12061f', bg2: '#2a0f45', fg: '#faf5ff', muted: '#bfa9d6', accent: '#e879f9', accent2: '#818cf8' },
  ocean: { mode: 'dark', bg: '#04152b', bg2: '#0a2d5a', fg: '#f0f9ff', muted: '#93b9dc', accent: '#38bdf8', accent2: '#2dd4bf' },
  forest: { mode: 'dark', bg: '#0b1a11', bg2: '#173322', fg: '#f0fdf4', muted: '#a2c4ad', accent: '#86efac', accent2: '#fde68a' },
  terminal: { mode: 'dark', bg: '#0d1117', bg2: '#1c2330', fg: '#e6edf3', muted: '#9198a1', accent: '#3fb950', accent2: '#58a6ff' },
  crimson: { mode: 'dark', bg: '#170a0e', bg2: '#38111d', fg: '#fff1f2', muted: '#d6a0ac', accent: '#fb7185', accent2: '#fbbf24' },
  gold: { mode: 'dark', bg: '#13100a', bg2: '#2c2410', fg: '#fefce8', muted: '#cdc097', accent: '#facc15', accent2: '#f97316' },
  paper: { mode: 'light', bg: '#faf8f5', bg2: '#ede6da', fg: '#1c1917', muted: '#5f574f', accent: '#c2410c', accent2: '#1d4ed8' },
  snow: { mode: 'light', bg: '#ffffff', bg2: '#e8eef6', fg: '#0f172a', muted: '#556274', accent: '#2563eb', accent2: '#7c3aed' },
  mint: { mode: 'light', bg: '#f0fdf7', bg2: '#cdf5df', fg: '#052e1c', muted: '#3a634f', accent: '#047857', accent2: '#0284c7' },
  blush: { mode: 'light', bg: '#fff5f7', bg2: '#fdd9e2', fg: '#3b0716', muted: '#83445a', accent: '#e11d48', accent2: '#9333ea' },
  sand: { mode: 'light', bg: '#fbf6ec', bg2: '#efe0c4', fg: '#2b2112', muted: '#6e5f45', accent: '#b45309', accent2: '#0f766e' },
  sky: { mode: 'light', bg: '#f0f7ff', bg2: '#d3e5fd', fg: '#0b1b3a', muted: '#465d82', accent: '#1d4ed8', accent2: '#db2777' },
};
