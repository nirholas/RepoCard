// RepoCard generator: paste a link, pick a concept, fine-tune, download.
(function () {
  'use strict';
  const { parseRepo, toast, copy, download, api } = window.RepoCard;
  const $ = (id) => document.getElementById(id);

  const els = {
    form: $('repo-form'),
    input: $('repo-input'),
    submit: $('submit-btn'),
    error: $('form-error'),
    studio: $('studio'),
    repoLink: $('repo-link'),
    badge: $('source-badge'),
    desc: $('repo-desc'),
    preview: $('preview'),
    img: $('preview-img'),
    concepts: $('concepts'),
    rationale: $('rationale'),
    settings: $('settings-link'),
    svg: $('svg-link'),
    swatches: $('swatches'),
    regenerate: $('regenerate-btn'),
    reset: $('reset-btn'),
    tagline: $('tagline-input'),
    title: $('title-input'),
    accent: $('accent-input'),
    accentClear: $('accent-clear'),
    stats: $('stats-toggle'),
    owner: $('owner-toggle'),
  };
  const selects = {
    layout: $('layout-select'),
    font: $('font-select'),
    background: $('bg-select'),
    mark: $('mark-select'),
  };

  const state = { repo: null, data: null, variant: 1, overrides: {}, options: null };

  function setBusy(busy) {
    els.submit.disabled = busy;
    els.submit.lastChild.textContent = busy ? ' Designing…' : ' Design my card';
  }

  function concept() {
    return state.data && state.data.concepts[state.variant - 1];
  }

  function currentUrl(format) {
    const c = concept();
    if (!c) return '';
    const url = new URL(format === 'svg' ? c.svg : c.png, location.origin);
    for (const [k, v] of Object.entries(state.overrides)) url.searchParams.set(k, v);
    if (!els.stats.checked) url.searchParams.set('stats', '0');
    if (!els.owner.checked) url.searchParams.set('owner', '0');
    return url.toString();
  }

  function updatePreview() {
    const url = currentUrl('png');
    if (!url) return;
    if (els.img.src === url) return;
    els.preview.classList.add('loading');
    els.img.src = url;
    els.svg.href = currentUrl('svg');
  }

  els.img.addEventListener('load', () => els.preview.classList.remove('loading'));
  els.img.addEventListener('error', () => {
    els.preview.classList.remove('loading');
    toast('That card could not be rendered. Try again in a moment.');
  });

  function label(s) {
    return String(s).replace(/-/g, ' ');
  }

  function syncControls() {
    const c = concept();
    if (!c) return;
    const spec = { ...c.spec, ...state.overrides };
    for (const [key, el] of Object.entries(selects)) el.value = spec[key];
    els.tagline.value = state.overrides.tagline ?? c.spec.tagline;
    els.title.value = state.overrides.title ?? c.spec.title;
    if (spec.accent) els.accent.value = spec.accent.startsWith('#') ? spec.accent : '#' + spec.accent;
    els.swatches.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.palette === spec.palette)));
    els.rationale.textContent = c.spec.rationale;
    els.concepts.querySelectorAll('.concept').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.variant) === state.variant)));
  }

  function renderConcepts() {
    els.concepts.replaceChildren(
      ...state.data.concepts.map((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'concept';
        b.dataset.variant = c.variant;
        b.setAttribute('aria-pressed', 'false');
        b.innerHTML =
          '<div class="thumb skeleton"><img alt="" loading="lazy"></div><div class="meta"><strong></strong><span></span></div>';
        const img = b.querySelector('img');
        img.addEventListener('load', () => img.parentElement.classList.remove('skeleton'));
        img.src = c.png;
        img.alt = 'Concept ' + c.variant + ': ' + c.spec.layout + ' layout';
        b.querySelector('strong').textContent = label(c.spec.layout);
        b.querySelector('span').textContent = label(c.spec.palette) + ' · ' + label(c.spec.font);
        b.addEventListener('click', () => selectVariant(c.variant));
        return b;
      }),
    );
  }

  function selectVariant(v) {
    state.variant = v;
    state.overrides = {};
    syncControls();
    updatePreview();
    updateUrl();
  }

  function updateUrl() {
    if (!state.repo) return;
    const params = new URLSearchParams({ repo: state.repo.full });
    if (state.variant !== 1) params.set('v', String(state.variant));
    history.replaceState(null, '', '/?' + params.toString());
  }

  function showData(data) {
    state.data = data;
    const r = data.repository;
    els.repoLink.textContent = r.fullName;
    els.repoLink.href = r.url;
    els.desc.textContent = r.description || '';
    els.settings.href = data.setup.settingsUrl;
    if (data.source === 'ai') {
      els.badge.className = 'badge ai';
      els.badge.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 6.9L21 12l-6.6 3.1L12 22l-2.4-6.9L3 12l6.6-3.1z"/></svg>';
      els.badge.append('Designed by AI');
      els.badge.title = data.model || '';
    } else {
      els.badge.className = 'badge';
      els.badge.textContent = 'Designed from metadata';
      els.badge.title = 'AI was unavailable, so these concepts were designed from repository metadata.';
    }
    renderConcepts();
    syncControls();
    updatePreview();
    els.studio.hidden = false;
  }

  async function run(input, { variant = 1, scroll = true } = {}) {
    els.error.textContent = '';
    const ref = parseRepo(input);
    if (!ref) {
      els.error.textContent = 'Paste a GitHub repository link, like github.com/owner/repo.';
      els.input.focus();
      return;
    }
    state.repo = ref;
    state.variant = Math.min(4, Math.max(1, Number(variant) || 1));
    state.overrides = {};
    els.input.value = 'github.com/' + ref.full;
    setBusy(true);
    try {
      const data = await api('/api/v1/cards/' + ref.full);
      showData(data);
      updateUrl();
      if (scroll) els.studio.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      els.error.textContent =
        err.status === 404
          ? "We couldn't find that repository. Is it public?"
          : err.status === 429 || err.status === 503
            ? 'RepoCard is busy right now. Please try again in a minute.'
            : err.message;
    } finally {
      setBusy(false);
    }
  }

  async function loadOptions() {
    try {
      state.options = await api('/api/v1/options');
    } catch {
      return;
    }
    const fill = (el, values) => {
      el.replaceChildren(...values.map((v) => new Option(label(v).replace(/^./, (c) => c.toUpperCase()), v)));
    };
    fill(selects.layout, state.options.layouts);
    fill(selects.font, state.options.fonts);
    fill(selects.background, state.options.backgrounds);
    fill(selects.mark, state.options.marks);
    els.swatches.replaceChildren(
      ...state.options.palettes.map((p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.dataset.palette = p.name;
        b.title = p.name;
        b.setAttribute('aria-label', p.name + ' palette');
        b.style.background = 'linear-gradient(135deg,' + p.bg + ' 0%,' + p.bg2 + ' 100%)';
        b.style.setProperty('--sw-accent', p.accent);
        b.addEventListener('click', () => setOverride('palette', p.name));
        return b;
      }),
    );
    syncControls();
  }

  function setOverride(key, value) {
    const c = concept();
    if (!c) return;
    if (value === '' || value === undefined || value === c.spec[key]) delete state.overrides[key];
    else state.overrides[key] = value;
    syncControls();
    updatePreview();
  }

  let debounce;
  function debounced(fn) {
    clearTimeout(debounce);
    debounce = setTimeout(fn, 450);
  }

  // Events
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(els.input.value);
  });
  document.querySelectorAll('[data-example]').forEach((b) => b.addEventListener('click', () => run(b.dataset.example)));
  for (const [key, el] of Object.entries(selects)) el.addEventListener('change', () => setOverride(key, el.value));
  els.tagline.addEventListener('input', () => debounced(() => setOverride('tagline', els.tagline.value.trim())));
  els.title.addEventListener('input', () => debounced(() => setOverride('title', els.title.value.trim())));
  els.accent.addEventListener('input', () => debounced(() => setOverride('accent', els.accent.value.replace('#', ''))));
  els.accentClear.addEventListener('click', () => setOverride('accent', ''));
  els.stats.addEventListener('change', updatePreview);
  els.owner.addEventListener('change', updatePreview);
  els.reset.addEventListener('click', () => {
    state.overrides = {};
    els.stats.checked = true;
    els.owner.checked = true;
    syncControls();
    updatePreview();
  });

  $('download-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await download(currentUrl('png'), state.repo.full.replace('/', '-') + '-social-preview.png');
      toast('Downloaded. Now upload it in your repo settings.');
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  document.querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', () => {
      const url = currentUrl('png');
      const alt = state.repo ? state.repo.full : 'Social preview';
      const value = { url, markdown: '![' + alt + '](' + url + ')', html: '<img src="' + url + '" alt="' + alt + '" width="1280" height="640">' }[b.dataset.copy];
      copy(value, b.textContent.replace('Copy ', ''));
    }),
  );

  els.regenerate.addEventListener('click', async () => {
    if (!state.repo) return;
    els.regenerate.disabled = true;
    els.preview.classList.add('loading');
    try {
      const data = await api('/api/v1/cards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repo: state.repo.full, refresh: true }),
      });
      state.variant = 1;
      state.overrides = {};
      showData(data);
      updateUrl();
      toast('Four new concepts ready');
    } catch (err) {
      els.preview.classList.remove('loading');
      toast(err.status === 429 ? 'Please wait a minute before asking for new concepts.' : err.message);
    } finally {
      els.regenerate.disabled = false;
    }
  });

  $('cta-btn').addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => els.input.focus(), 400);
  });

  loadOptions();
  const params = new URLSearchParams(location.search);
  if (params.get('repo')) run(params.get('repo'), { variant: params.get('v'), scroll: true });
})();
