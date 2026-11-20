// Bulk export: a card for every public repository of an account.
(function () {
  'use strict';
  const { toast, copy, saveBlob, api } = window.RepoCard;
  const $ = (id) => document.getElementById(id);
  const OWNER = /^(?!-)[a-z0-9-]{1,39}(?<!-)$/i;

  const els = {
    form: $('bulk-form'),
    input: $('owner-input'),
    submit: $('bulk-submit'),
    error: $('bulk-error'),
    results: $('results'),
    summary: $('summary'),
    progress: $('progress'),
    grid: $('grid'),
    zip: $('zip-btn'),
    links: $('links-btn'),
    forks: $('forks-toggle'),
    archived: $('archived-toggle'),
  };

  let repos = [];
  let owner = '';
  let loaded = 0;

  const mode = () => document.querySelector('input[name="mode"]:checked').value;
  const cardUrl = (r) => '/card/' + r.fullName + '.png' + (mode() === 'fast' ? '?mode=fast' : '');
  const fileName = (r) => r.fullName.split('/')[1] + '.png';

  function setProgress(done, total, label) {
    els.progress.style.width = total ? Math.round((done / total) * 100) + '%' : '0';
    els.summary.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = String(total);
    els.summary.append(b, ' repositories for ', owner, label ? ' · ' + label : '');
  }

  /** Run tasks with limited concurrency. */
  async function pool(items, limit, fn) {
    let i = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx], idx);
      }
    });
    await Promise.all(workers);
  }

  function card(r) {
    const el = document.createElement('article');
    el.className = 'panel repo-card';
    el.innerHTML =
      '<div class="thumb skeleton"><img alt="" width="1280" height="640"></div>' +
      '<div class="body"><div class="title"><a target="_blank" rel="noopener"></a><span class="stars"></span></div>' +
      '<p class="desc"></p><div class="btns"><button class="btn btn-sm" type="button">Download</button>' +
      '<a class="btn btn-sm" target="_blank" rel="noopener">Settings ↗</a></div></div>';
    const link = el.querySelector('.title a');
    link.textContent = r.fullName.split('/')[1];
    link.href = r.url;
    el.querySelector('.stars').textContent = r.stars ? '★ ' + r.stars.toLocaleString() : '';
    el.querySelector('.desc').textContent = r.description || 'No description';
    el.querySelector('.btns a').href = r.settingsUrl;
    el.querySelector('.btns button').addEventListener('click', async () => {
      const blob = await (await fetch(cardUrl(r))).blob();
      saveBlob(blob, fileName(r));
    });
    const img = el.querySelector('img');
    img.alt = 'Social preview for ' + r.fullName;
    img.addEventListener('load', () => {
      img.parentElement.classList.remove('skeleton');
      loaded += 1;
      setProgress(loaded, repos.length, loaded < repos.length ? 'designing ' + loaded + '/' + repos.length : 'ready');
    });
    img.addEventListener('error', () => {
      img.parentElement.classList.remove('skeleton');
      img.parentElement.insertAdjacentHTML('beforeend', '<div class="err">Could not render</div>');
    });
    el._img = img;
    return el;
  }

  async function load(e) {
    e && e.preventDefault();
    els.error.textContent = '';
    owner = els.input.value.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?github\.com\//i, '').split('/')[0];
    if (!OWNER.test(owner)) {
      els.error.textContent = 'Enter a GitHub username or organization.';
      return;
    }
    els.submit.disabled = true;
    try {
      const qs = new URLSearchParams({ limit: '300' });
      if (els.forks.checked) qs.set('forks', '1');
      if (els.archived.checked) qs.set('archived', '1');
      const data = await api('/api/v1/users/' + owner + '/repos?' + qs);
      repos = data.repositories;
      loaded = 0;
      history.replaceState(null, '', '/bulk/?owner=' + encodeURIComponent(owner));
      els.results.hidden = false;
      if (!repos.length) {
        els.grid.innerHTML = '<p class="empty">No public repositories match these filters.</p>';
        setProgress(0, 0, '');
        return;
      }
      const cards = repos.map(card);
      els.grid.replaceChildren(...cards);
      setProgress(0, repos.length, 'designing…');
      // Designs are generated per repository; keep a few in flight at once.
      await pool(cards, mode() === 'fast' ? 6 : 3, (c, i) =>
        new Promise((resolve) => {
          c._img.addEventListener('load', resolve, { once: true });
          c._img.addEventListener('error', resolve, { once: true });
          c._img.src = cardUrl(repos[i]);
        }),
      );
    } catch (err) {
      els.error.textContent = err.status === 404 ? 'That GitHub account was not found.' : err.message;
    } finally {
      els.submit.disabled = false;
    }
  }

  function settingsIndex() {
    const rows = repos
      .map((r) => '<li><a href="' + r.settingsUrl + '">' + r.fullName + '</a> &rarr; upload <code>' + fileName(r) + '</code></li>')
      .join('\n');
    return (
      '<!doctype html><meta charset="utf-8"><title>Social previews for ' + owner + '</title>' +
      '<style>body{font:16px/1.6 system-ui;max-width:760px;margin:40px auto;padding:0 20px}code{background:#eee;padding:1px 5px;border-radius:4px}</style>' +
      '<h1>Social previews for ' + owner + '</h1><p>For each repository: open Settings, find <b>Social preview</b>, click <b>Edit &rarr; Upload an image</b>, and choose the matching PNG from this folder.</p><ol>' +
      rows + '</ol><p>Generated by RepoCard.</p>'
    );
  }

  els.zip.addEventListener('click', async () => {
    if (!repos.length) return;
    els.zip.disabled = true;
    const files = [];
    let done = 0;
    try {
      await pool(repos, 4, async (r) => {
        const res = await fetch(cardUrl(r));
        if (res.ok) files.push({ name: fileName(r), data: new Uint8Array(await res.arrayBuffer()) });
        done += 1;
        setProgress(done, repos.length, 'zipping ' + done + '/' + repos.length);
      });
      files.sort((a, b) => a.name.localeCompare(b.name));
      files.push({ name: 'index.html', data: new TextEncoder().encode(settingsIndex()) });
      saveBlob(window.RepoCardZip.createZip(files), owner + '-social-previews.zip');
      setProgress(repos.length, repos.length, 'ready');
      toast('ZIP downloaded with ' + (files.length - 1) + ' cards');
    } catch (err) {
      toast(err.message);
    } finally {
      els.zip.disabled = false;
    }
  });

  els.links.addEventListener('click', () => copy(repos.map((r) => r.settingsUrl).join('\n'), 'Settings links'));
  els.form.addEventListener('submit', load);

  const initial = new URLSearchParams(location.search).get('owner');
  if (initial) {
    els.input.value = initial;
    load();
  }
})();
