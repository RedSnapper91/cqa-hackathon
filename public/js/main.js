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

// Sidebar navigation. `section` starts a labelled group.
const NAV = [
  { key: 'dashboard', href: '#/', icon: 'dashboard' },
  { key: 'dialogs', href: '#/dialogs', icon: 'dialogs' },
  { key: 'checklists', href: '#/checklists', icon: 'checklist' },
  { key: 'appeals', href: '#/appeals', icon: 'appeal' },
  { key: 'import', href: '#/import', icon: 'import' },
  { key: 'guide', href: '#/guide', icon: 'guide', section: 'nav_sec_help' },
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
    const label = t('nav_' + n.key);
    return `${n.section ? `<div class="nav-label">${t(n.section)}</div>` : ''}<a href="${n.href}" class="${n.key === activeKey ? 'active' : ''}" data-tip="${esc(label)}">${icon(n.icon)}<span class="label">${label}</span>${count}</a>`;
  }).join('');
  const sub = parseHash().name === 'dialog' ? parseHash().params[0] : null;
  $('#crumbs').innerHTML = `<span>${t('brand_product')}</span><span class="sep">/</span><b>${t('nav_' + activeKey)}</b>${sub ? `<span class="sep">/</span><b>${esc(sub)}</b>` : ''}`;
}

const isCollapsed = () => document.documentElement.dataset.sidebar === 'collapsed';
const isMobile = () => window.matchMedia('(max-width: 860px)').matches;

function drawToggle() {
  const b = $('#sb-toggle');
  const label = isCollapsed() ? t('sb_expand') : t('sb_collapse');
  b.innerHTML = `<span class="ti-desk">${icon(isCollapsed() ? 'panel-open' : 'panel-close')}</span><span class="ti-mob">${icon('menu')}</span>`;
  b.title = isMobile() ? t('sb_menu') : label;
  b.setAttribute('aria-label', b.title);
  b.setAttribute('aria-expanded', String(isMobile() ? !!document.documentElement.dataset.sbOpen : !isCollapsed()));
}

function drawChrome() {
  const e = state.health?.engine;
  $('#brand-product').textContent = t('brand_product');
  const engineName = e ? (e.mode === 'test' ? 'TEST MODE' : e.mode === 'model' ? e.label : t('engine_stub')) : '';
  let banner = document.getElementById('integration-test-banner');
  if (e?.mode === 'test' && !banner) {
    banner = document.createElement('div');
    banner.id = 'integration-test-banner';
    banner.textContent = 'TEST MODE · Deterministic fixture. Not real AI output.';
    banner.style.cssText = 'position:sticky;top:0;z-index:100;text-align:center;padding:8px;background:#f6e7bc;color:#6c5521;font-size:12px';
    document.body.prepend(banner);
  }
  $('#engine-card').innerHTML = `
    ${e ? `<div class="sb-status" data-tip="${esc(t('footer_engine'))}: ${esc(engineName)}">
      <span class="ic-slot"><span class="dot ${e.mode === 'model' ? 'live' : ''}"></span></span>
      <span class="label"><small>${t('footer_engine')}</small><b>${esc(engineName)}</b></span>
    </div>` : ''}
    <a class="sb-link" href="${api.exportUrl()}" download data-tip="${esc(t('export_csv'))}">${icon('download')}<span class="label">${t('export_csv')}</span></a>`;
  $('#lang-switch').innerHTML = LANGS.map((l) => `<button type="button" data-lang="${l}" class="${l === getLang() ? 'on' : ''}">${l === 'kz' ? 'Қаз' : l === 'en' ? 'Eng' : 'Рус'}</button>`).join('');
  const theme = document.documentElement.dataset.theme;
  $('#theme-toggle').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
  $('#theme-toggle').title = t('theme');
  drawToggle();
}

// ---- sidebar toggle: collapse to an icon rail on desktop, slide-out drawer on phones
function closeDrawer() { delete document.documentElement.dataset.sbOpen; drawToggle(); }
$('#sb-toggle').addEventListener('click', () => {
  const root = document.documentElement;
  if (isMobile()) {
    root.dataset.sbOpen ? closeDrawer() : (root.dataset.sbOpen = '1', drawToggle());
    return;
  }
  if (isCollapsed()) delete root.dataset.sidebar; else root.dataset.sidebar = 'collapsed';
  try { localStorage.setItem('cqa.sidebar', isCollapsed() ? 'collapsed' : 'expanded'); } catch {}
  hideTip();
  drawToggle();
});
$('#sb-backdrop').addEventListener('click', closeDrawer);
$('#sidebar').addEventListener('click', (e) => { if (isMobile() && e.target.closest('a')) closeDrawer(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.documentElement.dataset.sbOpen) closeDrawer(); });
window.matchMedia('(max-width: 860px)').addEventListener('change', () => { closeDrawer(); });

// Tooltips for the collapsed rail (the sidebar clips overflow, so they are positioned fixed).
let tipEl = null;
function hideTip() { tipEl?.remove(); tipEl = null; }
$('#sidebar').addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-tip]');
  if (!el || !isCollapsed() || isMobile()) return hideTip();
  if (tipEl?.dataset.for === el.dataset.tip) return;
  hideTip();
  const r = el.getBoundingClientRect();
  tipEl = document.createElement('div');
  tipEl.className = 'sb-tip';
  tipEl.dataset.for = el.dataset.tip;
  tipEl.textContent = el.dataset.tip;
  tipEl.style.left = `${r.right + 10}px`;
  tipEl.style.top = `${r.top + r.height / 2}px`;
  document.body.appendChild(tipEl);
});
$('#sidebar').addEventListener('mouseleave', hideTip);

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

// Language switch: a short loading state (~1.2 s) so the change reads as deliberate.
const LANG_LOADING = { ru: 'Переключаем язык…', en: 'Switching language…', kz: 'Тіл ауыстырылуда…' };
const LANG_DELAY_MS = 1200;
let langBusy = false;
async function switchLang(next) {
  if (langBusy || next === getLang()) return;
  langBusy = true;
  const root = document.documentElement;
  const ov = document.createElement('div');
  ov.className = 'lang-loading';
  ov.setAttribute('role', 'status');
  ov.setAttribute('aria-live', 'polite');
  ov.style.setProperty('--ll-ms', `${LANG_DELAY_MS}ms`);
  ov.innerHTML = `<div class="ll-bar"><i></i></div><div class="ll-box"><span class="spin"></span><span>${esc(LANG_LOADING[next] || LANG_LOADING.ru)}</span></div>`;
  document.body.appendChild(ov);
  root.setAttribute('aria-busy', 'true');
  $('#lang-switch').querySelectorAll('button').forEach((b) => b.classList.toggle('pending', b.dataset.lang === next));
  void ov.offsetWidth; // start the transitions from their initial state
  ov.classList.add('show');
  try {
    await new Promise((r) => setTimeout(r, LANG_DELAY_MS));
    setLang(next);
    drawChrome();
    await route();
  } finally {
    ov.classList.add('done');
    ov.classList.remove('show');
    setTimeout(() => ov.remove(), 220);
    root.removeAttribute('aria-busy');
    langBusy = false;
  }
}

document.addEventListener('click', (e) => {
  const lb = e.target.closest('[data-lang]');
  if (lb && lb.closest('#lang-switch')) switchLang(lb.dataset.lang);
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
