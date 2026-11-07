// Shared client state + long-running evaluation jobs.
import { api } from './api.js';
import { t } from './i18n.js';
import { esc, toast, $ } from './ui.js';

export const state = {
  health: null,
  checklists: [],
  active_checklist_id: null,
  rule_types: [],
  open_appeals: 0,
};

const listeners = new Set();
export const onMeta = (fn) => listeners.add(fn);

export async function refreshMeta() {
  const [h, cl, st] = await Promise.all([api.health(), api.checklists(), api.stats().catch(() => null)]);
  state.health = h;
  state.checklists = cl.checklists;
  state.active_checklist_id = cl.active_checklist_id;
  state.rule_types = cl.rule_types;
  state.open_appeals = st ? st.appeals_open : 0;
  listeners.forEach((fn) => fn(state));
  return state;
}

export const activeChecklist = () => state.checklists.find((c) => c.id === state.active_checklist_id) || state.checklists[0];
export const checklistOptions = (selected = state.active_checklist_id) =>
  state.checklists
    .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}, v${c.version}${c.id === state.active_checklist_id ? ` (${t('active')})` : ''}</option>`)
    .join('');

/**
 * Run an evaluation. One dialog → synchronous; many → background job with a progress bar.
 * Resolves when everything is done.
 */
export async function runEvaluation(body) {
  const r = await api.evaluate(body);
  if (r.evaluation) return { evaluations: [r.evaluation] };
  return new Promise((resolve) => {
    const bar = document.createElement('div');
    bar.className = 'jobbar';
    document.body.appendChild(bar);
    const draw = (j) => {
      const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
      bar.innerHTML = `<div class="row" style="justify-content:space-between">
          <b style="font-weight:600">${j.status === 'done' ? t('job_done') : '<span class="spin" style="color:var(--brand);vertical-align:-2px"></span>&nbsp; ' + t('job_running')}</b>
          <span class="muted mono">${j.done} / ${j.total}${j.failed ? ` · ${j.failed} ${t('errors')}` : ''}</span>
        </div><div class="progress"><i style="width:${pct}%"></i></div>`;
    };
    draw(r);
    const poll = async () => {
      try {
        const j = await api.job(r.id);
        draw(j);
        if (j.status === 'done') {
          setTimeout(() => bar.remove(), 1400);
          if (j.failed) toast(`${j.failed} ${t('errors')}: ${j.errors[0]?.error || ''}`, 'err');
          await refreshMeta();
          resolve(j);
          return;
        }
      } catch (e) {
        toast(e.message, 'err');
      }
      setTimeout(poll, 350);
    };
    setTimeout(poll, 250);
  });
}

export const isViewAlive = (token) => $('#view').dataset.token === token;
