// Bundles the CLI (and the shared design/render code from ../../src) into
// dist/repocard.mjs, and copies the OFL fonts it renders with.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

rmSync(join(here, 'dist'), { recursive: true, force: true });
await build({
  entryPoints: [join(here, 'src/bin.ts')],
  outfile: join(here, 'dist/repocard.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['@cf-wasm/satori', '@cf-wasm/satori/*', '@resvg/resvg-wasm', 'playwright', 'playwright-core'],
  define: { __VERSION__: JSON.stringify(pkg.version) },
  // Functions passed to page.evaluate() are serialized; keep them free of helpers.
  keepNames: false,
  legalComments: 'none',
  logLevel: 'warning',
});

rmSync(join(here, 'fonts'), { recursive: true, force: true });
mkdirSync(join(here, 'fonts'), { recursive: true });
cpSync(join(here, '../../src/render/font-files'), join(here, 'fonts'), { recursive: true });
console.log(`Built repocard ${pkg.version}`);
