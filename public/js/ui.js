import { t, getLang } from './i18n.js';
import { scaleMax } from '/lib/scoring.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
  dialogs: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14.5h4"/>',
  checklist: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/>',
  appeal: '<path d="m12 3 8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z"/><path d="M12 8v5M12 16.5v.5"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5.5 5.5 0 0 1 3.5 6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
};
export const icon = (name, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${P[name] || ''}</svg>`;

export function scoreClass(v) {
  if (v === null || v === undefined) return 's-none';
  return v >= 85 ? 's-hi' : v >= 65 ? 's-mid' : 's-lo';
}
export const fmtScore = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(v % 1 ? 2 : 0));
export const scoreColor = (v) => (v === null || v === undefined ? 'var(--na)' : v >= 85 ? 'var(--brand)' : v >= 65 ? 'var(--warn)' : 'var(--no)');

export function ring(value, { size = 132, stroke = 11, label = '', sub = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  const color = scoreColor(value);
  return `<div class="ring" style="width:${size}px;height:${size}px;--ring-glow:${color}55">
    <svg width="${size}" height="${size}">
      <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"/>
      <circle class="bar" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none" stroke="${color}"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - pct / 100)}"/>
    </svg>
    <div class="label"><div><b style="font-size:${Math.round(size * (value % 1 ? 0.21 : 0.26))}px" data-count="${value ?? ''}">${value === null || value === undefined ? '—' : '0'}</b>${label ? `<small>${esc(label)}</small>` : ''}${sub ? `<small>${sub}</small>` : ''}</div></div>
  </div>`;
}

/** Animate rings and count-ups inside a root after render. */
export function animate(root = document) {
  requestAnimationFrame(() => {
    $$('.ring .bar', root).forEach((el) => (el.style.strokeDashoffset = el.dataset.target));
    $$('[data-count]', root).forEach((el) => {
      const target = parseFloat(el.dataset.count);
      if (Number.isNaN(target)) return;
      const dec = target % 1 ? 2 : 0;
      const t0 = performance.now();
      const dur = 900;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = (target * e).toFixed(dec);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
}

export function ansClass(crit, answer) {
  if (answer === 'na') return 'na';
  if (crit.type === 'flag') return answer === 'yes' ? 'flag-yes' : 'flag-no';
  if (crit.type === 'binary') return answer === 'yes' ? 'yes' : 'no';
  const max = scaleMax(crit);
  const k = max ? Number(answer) / max : 0;
  return k >= 0.99 ? 'yes' : k <= 0.01 ? 'no' : 'mid';
}
export function ansLabel(crit, answer) {
  if (answer === null || answer === undefined) return '—';
  if (answer === 'na') return 'N/A';
  if (crit.type === 'scale') return `${answer}/${scaleMax(crit)}`;
  return answer === 'yes' ? t('yes') : t('no');
}
export const ans = (crit, answer) => `<span class="ans ${ansClass(crit, answer)}">${esc(ansLabel(crit, answer))}</span>`;

export function answerOptions(crit, selected) {
  const opts = [];
  if (crit.type === 'scale') (crit.scale || []).forEach((s) => opts.push([String(s.value), `${s.value} — ${s.label}`]));
  else opts.push(['yes', t('yes')], ['no', t('no')]);
  if (crit.allow_na) opts.push(['na', 'N/A']);
  return opts.map(([v, l]) => `<option value="${esc(v)}" ${String(selected) === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const loc = getLang() === 'en' ? 'en-GB' : getLang() === 'kz' ? 'kk-KZ' : 'ru-RU';
  return d.toLocaleString(loc, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Display timestamp: MM:SS as is; ISO → HH:MM:SS local. */
export function fmtTs(ts) {
  return ts || '';
}

export function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="dot"></span><span>${esc(msg)}</span>`;
  $('#toast-root').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

export function modal(html, { wide = false } = {}) {
  const root = $('#modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  root.appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => e.target === wrap && close());
  $$('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
  setTimeout(() => $('textarea, input, select', wrap)?.focus(), 50);
  return { el: wrap, close };
}

export function emptyState(iconName, title, text, actionHtml = '') {
  return `<div class="empty"><div class="em-icon">${icon(iconName)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${actionHtml}</div>`;
}

export const debounce = (fn, ms = 200) => {
  let tm;
  return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); };
};

export const roleLabel = (s) => t(s);
