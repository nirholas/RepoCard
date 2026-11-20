/**
 * Upload social previews through the GitHub web UI in a browser the user
 * controls. GitHub has no API for this, so the CLI drives the same form a
 * person would use. The user signs in themselves; credentials never pass
 * through RepoCard. Nothing is uploaded without --yes.
 */
import type { RepoRef } from '../../../src/lib/repo-ref';

export interface ApplyTarget {
  ref: RepoRef;
  file: string;
}

export interface ApplyOptions {
  render: (target: ApplyTarget) => Promise<void>;
  token?: string;
  yes: boolean;
  overwrite: boolean;
  headless: boolean;
  delayMs: number;
  profileDir: string;
  log: (message: string) => void;
  source: string;
}

export interface PreviewStatus {
  custom: boolean;
  admin: boolean;
  imageUrl: string;
}

const key = (r: RepoRef) => `${r.owner}/${r.repo}`.toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Whether each repository already has a custom preview, and whether the token holder can change it. */
export async function previewStatus(refs: RepoRef[], token: string): Promise<Map<string, PreviewStatus>> {
  const out = new Map<string, PreviewStatus>();
  for (let i = 0; i < refs.length; i += 40) {
    const chunk = refs.slice(i, i + 40);
    const fields = chunk
      .map(
        (r, j) =>
          `r${j}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.repo)}) { usesCustomOpenGraphImage openGraphImageUrl viewerPermission }`,
      )
      .join('\n');
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'repocard-cli' },
      body: JSON.stringify({ query: `query {\n${fields}\n}` }),
    });
    if (!res.ok) throw new Error(`GitHub GraphQL returned ${res.status}`);
    const body = (await res.json()) as {
      data?: Record<string, { usesCustomOpenGraphImage: boolean; openGraphImageUrl: string; viewerPermission: string } | null>;
    };
    chunk.forEach((r, j) => {
      const d = body.data?.[`r${j}`];
      if (d) out.set(key(r), { custom: d.usesCustomOpenGraphImage, admin: d.viewerPermission === 'ADMIN', imageUrl: d.openGraphImageUrl });
    });
  }
  return out;
}

type PlaywrightModule = { chromium: { launchPersistentContext: (dir: string, opts: Record<string, unknown>) => Promise<BrowserContext> } };
interface BrowserContext {
  pages(): Page[];
  newPage(): Promise<Page>;
  close(): Promise<void>;
}
interface Page {
  goto(url: string, opts?: Record<string, unknown>): Promise<{ status(): number } | null>;
  url(): string;
  waitForURL(pred: (url: URL) => boolean, opts?: Record<string, unknown>): Promise<void>;
  waitForLoadState(state: string, opts?: Record<string, unknown>): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  setInputFiles(selector: string, file: string): Promise<void>;
  bringToFront(): Promise<void>;
}

async function loadPlaywright(): Promise<{ pw: PlaywrightModule; channel?: string }> {
  for (const name of ['playwright', 'playwright-core']) {
    try {
      const pw = (await import(name)) as PlaywrightModule;
      // playwright-core ships no browsers; use the installed Chrome.
      return { pw, channel: name === 'playwright-core' ? 'chrome' : undefined };
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'apply needs Playwright. Install it once with:\n  npm install -g playwright && npx playwright install chromium\n' +
      'or run: npx -p playwright -p repocard repocard apply ...',
  );
}

/** Marks the file input inside the "Social preview" section, returning whether one was found. */
function markSocialPreviewInput(): boolean {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const match = inputs.find((input) => {
    let node: HTMLElement | null = input;
    for (let depth = 0; depth < 10 && node; depth++, node = node.parentElement) {
      if (/social preview/i.test(node.textContent ?? '')) return true;
    }
    return false;
  });
  if (match) match.setAttribute('data-repocard-target', '1');
  return Boolean(match);
}

export async function applyCards(targets: ApplyTarget[], opts: ApplyOptions): Promise<void> {
  const { log } = opts;
  if (!targets.length) return log('No repositories to update.');

  let status = new Map<string, PreviewStatus>();
  if (opts.token) {
    try {
      status = await previewStatus(
        targets.map((t) => t.ref),
        opts.token,
      );
    } catch (err) {
      log(`Could not read current previews (${(err as Error).message}); continuing without that check.`);
    }
  } else {
    log('No GitHub token found, so existing custom previews cannot be detected. Set GITHUB_TOKEN or run `gh auth login`.');
  }

  const plan: ApplyTarget[] = [];
  log(`\nPlan (${opts.source}):`);
  for (const t of targets) {
    const s = status.get(key(t.ref));
    const name = `${t.ref.owner}/${t.ref.repo}`;
    if (s && !s.admin) log(`  skip    ${name}  (you need admin access)`);
    else if (s?.custom && !opts.overwrite) log(`  keep    ${name}  (already has a custom preview; --overwrite to replace)`);
    else {
      log(`  upload  ${name}`);
      plan.push(t);
    }
  }
  if (!plan.length) return log('\nNothing to do.');

  log(`\nRendering ${plan.length} card(s)…`);
  for (const t of plan) {
    await opts.render(t);
    log(`  ✓ ${t.ref.owner}/${t.ref.repo} → ${t.file}`);
  }

  if (!opts.yes) {
    log(`\nDry run: nothing was uploaded. Cards are saved above. Re-run with --yes to upload ${plan.length} preview(s).`);
    return;
  }

  const { pw, channel } = await loadPlaywright();
  const context = await pw.chromium.launchPersistentContext(opts.profileDir, {
    headless: opts.headless,
    channel,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  let uploaded = 0;
  const failed: string[] = [];

  try {
    await page.goto('https://github.com/settings/profile', { waitUntil: 'domcontentloaded' });
    if (/\/login|\/session/.test(page.url())) {
      if (opts.headless) throw new Error('Not signed in. Run once without --headless and sign in to GitHub in the window.');
      await page.bringToFront();
      log('\nSign in to GitHub in the browser window. RepoCard waits up to 10 minutes and never sees your password.');
      await page.waitForURL((u) => u.hostname === 'github.com' && !/^\/(login|session|sessions)/.test(u.pathname), { timeout: 600_000 });
    }

    for (const t of plan) {
      const name = `${t.ref.owner}/${t.ref.repo}`;
      const prior = status.get(key(t.ref));
      try {
        const res = await page.goto(`https://github.com/${name}/settings`, { waitUntil: 'domcontentloaded' });
        if (res && res.status() === 404) throw new Error('settings not available (need admin access)');
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
        const found = await page.evaluate(markSocialPreviewInput);
        if (!found) throw new Error('could not find the Social preview upload control (GitHub may have changed its settings page)');
        await page.setInputFiles('[data-repocard-target="1"]', t.file);
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
        await sleep(1500);

        if (opts.token) {
          const after = (await previewStatus([t.ref], opts.token)).get(key(t.ref));
          if (!after?.custom) throw new Error('upload did not take effect');
          const changed = !prior?.custom || after.imageUrl !== prior.imageUrl;
          log(`  ✓ ${name}  (${changed ? 'verified' : 'uploaded; GitHub may take a moment to show the new image'})`);
        } else {
          log(`  ✓ ${name}  (uploaded; set GITHUB_TOKEN to verify)`);
        }
        uploaded += 1;
      } catch (err) {
        failed.push(name);
        log(`  ✗ ${name}: ${(err as Error).message}\n    Upload manually: https://github.com/${name}/settings → Social preview → ${t.file}`);
      }
      await sleep(opts.delayMs);
    }
  } finally {
    await context.close();
  }

  log(`\nUploaded ${uploaded}/${plan.length}.${failed.length ? ` Failed: ${failed.join(', ')}` : ''}`);
  if (failed.length) process.exitCode = 1;
}
