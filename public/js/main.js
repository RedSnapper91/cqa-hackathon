import { t, setLang, getLang, LANGS } from './i18n.js';
import { icon, esc, $, toast } from './ui.js';
import { state, refreshMeta, onMeta, activeChecklist } from './state.js';
import * as dashboard from './views/dashboard.js';
import * as dialogs from './views/dialogs.js';
import * as dialog from './views/dialog.js';
import * as checklists from './views/checklists.js';
import * as appeals from './views/appeals.js';
import * as importer from './views/importer.js';
import * as guide from './views/guide.js';
import { api } from './api.js';

// Top navigation, text only (like freedombroker.kz). The guide lives in the header button.
const NAV = [
  { key: 'dashboard', href: '#/' },
  { key: 'dialogs', href: '#/dialogs' },
  { key: 'checklists', href: '#/checklists' },
  { key: 'appeals', href: '#/appeals' },
  { key: 'import', href: '#/import' },
];

const ROUTES = {
  '': { view: dashboard, nav: 'dashboard' },
  dialogs: { view: dialogs, nav: 'dialogs' },
  dialog: { view: dialog, nav: 'dialogs' },
  checklists: { view: checklists, nav: 'checklists' },
  appeals: { view: appeals, nav: 'appeals' },
  import: { view: importer, nav: 'import' },
  guide: { view: guide, nav: 'guide' },
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || '', params: parts.slice(1), query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function drawNav(activeKey) {
  $('#nav').innerHTML = NAV.map((n) => {
    const count = n.key === 'appeals' && state.open_appeals ? `<span class="count hot">${state.open_appeals}</span>` : '';
    return `<a href="${n.href}" class="${n.key === activeKey ? 'active' : ''}">${t('nav_' + n.key)}${count}</a>`;
  }).join('');
  $('#help-link').classList.toggle('btn-primary', activeKey === 'guide');
}

function drawChrome() {
  const e = state.health?.engine;
  const cl = activeChecklist();
  $('#brand-product').textContent = t('brand_product');
  $('#help-link').textContent = t('help');
  $('#engine-card').innerHTML = `
    <span>Freedom CQA · ${t('brand_product')}</span>
    <span class="footer-meta">
      ${e ? `<span><span class="dot ${e.mode === 'model' ? 'live' : ''}"></span>&nbsp; ${t('footer_engine')}: <b>${e.mode === 'model' ? esc(e.label) : t('engine_stub')}</b></span>` : ''}
      ${cl ? `<span>${t('active_checklist')}: <a href="#/checklists">${esc(cl.name)}, v${cl.version}</a></span>` : ''}
      <a href="${api.exportUrl()}" download>${t('export_csv')}</a>
    </span>`;
  $('#lang-switch').innerHTML = LANGS.map((l) => `<button type="button" data-lang="${l}" class="${l === getLang() ? 'on' : ''}">${l === 'kz' ? 'Қаз' : l === 'en' ? 'Eng' : 'Рус'}</button>`).join('');
  const theme = document.documentElement.dataset.theme;
  $('#theme-toggle').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
  $('#theme-toggle').title = t('theme');
}

let cleanup = null;
let token = 0;

async function route() {
  const { name, params, query } = parseHash();
  const r = ROUTES[name] || ROUTES[''];
  drawNav(r.nav);
  if (name) guide.markSeen(name);
  $('#page-title').textContent = t('title_' + r.nav);
  $('#page-sub').textContent = t('sub_' + r.nav);
  $('#page-actions').innerHTML = '';
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  const view = $('#view');
  view.onclick = view.oninput = view.onchange = null;
  $('#modal-root').innerHTML = '';
  view.dataset.token = String(++token);
  view.innerHTML = '<div class="skeleton" style="height:220px"></div>';
  try {
    cleanup = await r.view.render(view, params, query, String(token));
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><b>${t('err')}:</b> ${esc(e.message)}</div>`;
  }
}

export function rerender() { route(); }

document.addEventListener('click', (e) => {
  const lb = e.target.closest('[data-lang]');
  if (lb && lb.closest('#lang-switch')) {
    setLang(lb.dataset.lang);
    drawChrome();
    route();
  }
});
$('#theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('cqa.theme', next); } catch {}
  drawChrome();
});

onMeta(() => {
  drawChrome();
  drawNav((ROUTES[parseHash().name] || ROUTES['']).nav);
});

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || String(e.reason), 'err'));

setLang(getLang());
refreshMeta()
  .then(route)
  .catch((e) => {
    $('#view').innerHTML = `<div class="card"><b>API недоступен:</b> ${esc(e.message)}</div>`;
  });
