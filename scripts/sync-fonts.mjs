#!/usr/bin/env node
// Copies the OFL-licensed font files RepoCard renders with from @fontsource
// into src/render/font-files (bundled into the Worker) and public/fonts (served to
// the web UI). Re-run after bumping a @fontsource package.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src/render/font-files');
const web = join(root, 'public/fonts');
mkdirSync(out, { recursive: true });
mkdirSync(web, { recursive: true });

export const FONT_FILES = [
  ['inter', 'inter-latin-400-normal'],
  ['inter', 'inter-latin-500-normal'],
  ['inter', 'inter-latin-700-normal'],
  ['inter', 'inter-latin-800-normal'],
  ['space-grotesk', 'space-grotesk-latin-700-normal'],
  ['jetbrains-mono', 'jetbrains-mono-latin-400-normal'],
  ['jetbrains-mono', 'jetbrains-mono-latin-700-normal'],
  ['instrument-serif', 'instrument-serif-latin-400-normal'],
  ['instrument-serif', 'instrument-serif-latin-400-italic'],
  ['sora', 'sora-latin-700-normal'],
  ['bricolage-grotesque', 'bricolage-grotesque-latin-800-normal'],
];

// The web UI only needs a subset, as woff2.
const WEB_FILES = ['inter-latin-400-normal', 'inter-latin-500-normal', 'inter-latin-700-normal', 'inter-latin-800-normal', 'jetbrains-mono-latin-400-normal', 'instrument-serif-latin-400-italic'];

const notices = [];
for (const [pkg, file] of FONT_FILES) {
  const dir = join(root, 'node_modules/@fontsource', pkg);
  copyFileSync(join(dir, 'files', `${file}.woff`), join(out, `${file}.woff`));
  if (WEB_FILES.includes(file)) copyFileSync(join(dir, 'files', `${file}.woff2`), join(web, `${file}.woff2`));
  if (!notices.some((n) => n.pkg === pkg)) notices.push({ pkg, license: readFileSync(join(dir, 'LICENSE'), 'utf8') });
}
const text = notices.map((n) => `==== @fontsource/${n.pkg} ====\n\n${n.license.trim()}\n`).join('\n');
writeFileSync(join(out, 'LICENSES.txt'), text);
writeFileSync(join(web, 'LICENSES.txt'), text);
console.log(`Synced ${FONT_FILES.length} fonts.`);
