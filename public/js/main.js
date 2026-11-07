import { t, setLang, getLang, LANGS } from './i18n.js';
import { icon, esc, $, toast } from './ui.js';
import { state, refreshMeta, onMeta, activeChecklist } from './state.js';
import * as dashboard from './views/dashboard.js';
import * as dialogs from './views/dialogs.js';
import * as dialog from './views/dialog.js';
import * as checklists from './views/checklists.js';
import * as appeals from './views/appeals.js';
import * as importer from './views/importer.js';
import { api } from './api.js';

const NAV = [
  { key: 'dashboard', href: '#/', icon: 'dashboard' },
  { key: 'dialogs', href: '#/dialogs', icon: 'dialogs' },
  { key: 'checklists', href: '#/checklists', icon: 'checklist' },
  { key: 'appeals', href: '#/appeals', icon: 'appeal' },
  { key: 'import', href: '#/import', icon: 'import' },
];

const ROUTES = {
  '': { view: dashboard, nav: 'dashboard' },
  dialogs: { view: dialogs, nav: 'dialogs' },
  dialog: { view: dialog, nav: 'dialogs' },
  checklists: { view: checklists, nav: 'checklists' },
  appeals: { view: appeals, nav: 'appeals' },
  import: { view: importer, nav: 'import' },
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
    return `<a href="${n.href}" class="${n.key === activeKey ? 'active' : ''}">${icon(n.icon)}<span>${t('nav_' + n.key)}</span>${count}</a>`;
  }).join('');
}

function drawChrome() {
  const e = state.health?.engine;
  $('#engine-card').innerHTML = e
    ? `<div class="engine">
        <div class="engine-head"><span class="dot ${e.mode === 'model' ? 'live' : ''}"></span>${icon('cpu').replace('<svg', '<svg style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2"')} ${e.mode === 'model' ? t('engine_model') : t('engine_stub')}</div>
        <p>${e.mode === 'model' ? esc(e.label) : t('engine_stub_text')}</p>
        <p style="margin-top:10px"><a class="btn btn-sm" href="${api.exportUrl()}" download>${icon('download')} ${t('export_csv')}</a></p>
      </div>`
    : '';
  const cl = activeChecklist();
  const pill = $('#active-checklist');
  pill.innerHTML = cl ? `<span>${esc(cl.name)} · v${cl.version}</span>` : '';
  pill.title = t('active_checklist');
  $('#lang-switch').innerHTML = LANGS.map((l) => `<button type="button" data-lang="${l}" class="${l === getLang() ? 'on' : ''}">${l.toUpperCase()}</button>`).join('');
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
  $('#page-title').textContent = t('nav_' + r.nav);
  $('#page-sub').textContent = t('sub_' + r.nav);
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  const view = $('#view');
  view.onclick = view.oninput = view.onchange = null;
  $('#modal-root').innerHTML = '';
  document.querySelectorAll('.jobbar').forEach((b) => b.dataset.keep || null);
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
