#!/usr/bin/env node
// Insert or update a RepoCard banner at the top of a README, between markers,
// so re-running the Action replaces it instead of stacking copies.
//
//   node readme-banner.mjs README.md .github/social-preview.png "owner/repo"
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const START = '<!-- repocard:start -->';
export const END = '<!-- repocard:end -->';

export function bannerBlock(imagePath, alt) {
  const safeAlt = String(alt).replace(/[<>"&]/g, '');
  const src = imagePath.replace(/^\.\//, '');
  return `${START}\n<p align="center"><img src="${src}" alt="${safeAlt}" width="100%"></p>\n${END}`;
}

export function upsertBanner(readme, imagePath, alt) {
  const block = bannerBlock(imagePath, alt);
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start !== -1 && end > start) return readme.slice(0, start) + block + readme.slice(end + END.length);
  return `${block}\n\n${readme.replace(/^﻿/, '')}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, image, alt = 'Social preview'] = process.argv.slice(2);
  if (!file || !image) {
    console.error('Usage: readme-banner.mjs <README.md> <image-path> [alt]');
    process.exit(1);
  }
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const after = upsertBanner(before, image, alt);
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`Updated banner in ${file}`);
  } else {
    console.log(`Banner in ${file} is already up to date`);
  }
}
