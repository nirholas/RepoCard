import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ORIGIN, repoLlmsFullTxt, repoLlmsTxt } from '../src/llms';

const root = join(__dirname, '..');

describe('committed llms files', () => {
  it('match the generator (run `npm run llms:sync` if this fails)', () => {
    expect(readFileSync(join(root, 'llms.txt'), 'utf8')).toBe(repoLlmsTxt(REPO_ORIGIN));
    expect(readFileSync(join(root, 'llms-full.txt'), 'utf8')).toBe(repoLlmsFullTxt(REPO_ORIGIN));
  });
});
