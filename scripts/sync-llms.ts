/**
 * Writes llms.txt and llms-full.txt at the repository root from the same
 * source the Worker serves, so agents reading the repo and the site agree.
 * test/llms.test.ts fails if these files are stale.
 *
 *   npm run llms:sync
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ORIGIN, repoLlmsFullTxt, repoLlmsTxt } from '../src/llms';

const root = join(import.meta.dirname, '..');
writeFileSync(join(root, 'llms.txt'), repoLlmsTxt(REPO_ORIGIN));
writeFileSync(join(root, 'llms-full.txt'), repoLlmsFullTxt(REPO_ORIGIN));
console.log('Wrote llms.txt and llms-full.txt');
