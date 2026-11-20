// Shared helpers for the RepoCard web UI.
(function () {
  'use strict';

  const OWNER = /^(?!-)[a-z0-9-]{1,39}(?<!-)$/i;
  const REPO = /^[a-z0-9._-]{1,100}$/i;

  /** Mirror of src/lib/repo-ref.ts parseRepoRef, for instant client-side validation. */
  function parseRepo(input) {
    let s = String(input || '').trim();
    if (!s) return null;
    s = s.replace(/^gh\s+repo\s+(clone|view)\s+/i, '')
      .replace(/^git@github\.com:/i, 'github.com/')
      .replace(/^(git\+)?(https?|ssh|git):\/\/(git@)?/i, '')
      .replace(/^www\./i, '');
    if (/^github\.com\//i.test(s)) s = s.slice(11);
    else if (/^[^/\s]+\.[a-z]{2,}\//i.test(s)) return null;
    const parts = s.split(/[?#]/)[0].split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    if (!OWNER.test(owner) || owner.includes('--') || !REPO.test(repo) || repo === '.' || repo === '..') return null;
    return { owner, repo, full: owner + '/' + repo };
  }

  let toastTimer;
  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast((label || 'Copied') + ' to clipboard');
  }

  /** Download a URL as a file with the given name. */
  async function download(url, filename) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Download failed (' + res.status + ')');
    const blob = await res.blob();
    saveBlob(blob, filename);
  }

  function saveBlob(blob, filename) {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  }

  async function api(path, init) {
    const res = await fetch(path, init);
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON */
    }
    if (!res.ok) {
      const err = new Error((body && body.error && body.error.message) || 'Request failed (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    return body;
  }

  /** Copy buttons on code blocks, live origin in snippets, lazy gallery images. */
  function enhance() {
    document.querySelectorAll('[data-origin]').forEach((el) => {
      el.textContent = location.origin + el.textContent;
    });
    document.querySelectorAll('pre.code').forEach((pre) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', () => copy(pre.querySelector('code').innerText.trim(), 'Snippet'));
      pre.appendChild(btn);
    });
    const lazy = document.querySelectorAll('img[data-src]');
    const load = (img) => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            load(e.target);
            io.unobserve(e.target);
          }
        });
      }, { rootMargin: '200px' });
      lazy.forEach((img) => io.observe(img));
    } else {
      lazy.forEach(load);
    }
  }

  window.RepoCard = { parseRepo, toast, copy, download, saveBlob, api };
  document.addEventListener('DOMContentLoaded', enhance);
})();
