import { api } from '../api.js';
import { t } from '../i18n.js';
import { esc, scoreClass, fmtScore, emptyState, $ } from '../ui.js';
import { runEvaluation, activeChecklist, isViewAlive } from '../state.js';

// Average score colour follows the same bands as the histogram legend: <65 red, 65–84 amber, ≥85 green.
const AVG_TONE = { 's-hi': 'good', 's-mid': 'mid', 's-lo': 'danger' };

export async function render(view, params, query, token) {
  const s = await api.stats();
  if (!isViewAlive(token)) return;
  const cl = activeChecklist();
  const maxHist = Math.max(1, ...s.histogram.map((h) => h.count));
  const evaluated = s.evaluated > 0;

  $('#page-actions').innerHTML = `
    <a class="btn" href="#/dialogs">${t('open_dialogs')}</a>
    <button class="btn btn-primary" id="run-all">${t('evaluate_all')}</button>`;

  const risk = [...new Map([...s.worst, ...s.gross_list].map((w) => [w.conversation_id, w])).values()]
    .sort((a, b) => (b.gross - a.gross) || (a.total - b.total))
    .slice(0, 8);

  view.innerHTML = `
    <div class="dash-bar">
      <span>${t('active_checklist')}: <a class="link" href="#/checklists">${esc(cl?.name)}, v${cl?.version}</a></span>
    </div>

    <section class="stats">
      ${stat(t('kpi_dialogs'), s.conversations, `${s.calls} ${t('kpi_calls')} · ${s.by_language.map((l) => l.language).join(', ')}`)}
      ${stat(t('kpi_evaluated'), s.evaluated, `${t('kpi_of')} ${s.conversations}`)}
      ${stat(t('kpi_avg'), fmtScore(s.average), t('kpi_after_appeals'), AVG_TONE[scoreClass(s.average)] || '', t('of_100'))}
      ${stat(t('kpi_gross'), s.gross_errors, t('kpi_gross_sub'), s.gross_errors ? 'danger' : '')}
      ${stat(t('kpi_appeals'), s.appeals_open, `${t('kpi_open')}, ${t('kpi_of')} ${s.appeals_total}`, s.appeals_open ? 'warn' : '')}
    </section>

    ${evaluated ? `
    <section class="grid-2">
      <div class="card">
        <div class="card-head"><h3>${t('hist_title')}</h3><span class="muted">${t('hist_sub')}</span></div>
        <div class="hist">
          ${s.histogram.map((h) => `
            <div class="col" title="${h.from}–${h.to}: ${h.count}">
              <div class="bar ${h.from < 65 ? 'lo' : h.from < 85 ? 'mid' : ''}" style="height:${(h.count / maxHist) * 100}%">${h.count ? `<b>${h.count}</b>` : ''}</div>
            </div>`).join('')}
        </div>
        <div class="hist-ticks">${s.histogram.map((h) => `<span>${h.from}</span>`).join('')}</div>
        <div class="legend">
          <span><i style="background:#ef4444"></i>${t('leg_lo')}</span>
          <span><i style="background:var(--warn-bar)"></i>${t('leg_mid')}</span>
          <span><i style="background:var(--brand)"></i>${t('leg_hi')}</span>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>${t('crit_title')}</h3><span class="muted">${t('crit_sub')}</span></div>
        <table class="dt">
          <thead><tr><th class="n0">№</th><th>${t('col_crit')}</th><th style="width:30%">${t('col_rate')}</th><th class="num">%</th></tr></thead>
          <tbody>
          ${s.per_criterion.map((c) => `
            <tr title="N/A: ${c.na}">
              <td class="n0">${esc(c.code)}</td>
              <td>${esc(c.title)}</td>
              <td><div class="meter"><i class="${c.type === 'flag' ? 'danger' : c.rate !== null && c.rate < 65 ? 'mid' : ''}" style="width:${c.rate ?? 0}%"></i></div></td>
              <td class="num" style="${c.type === 'flag' && c.rate ? 'color:var(--no)' : ''}">${c.rate === null ? '—' : c.rate.toFixed(0)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h3>${t('risk_title')}</h3><span class="muted">${t('risk_sub')}</span></div>
        <table class="dt">
          <thead><tr><th>${t('col_dialog')}</th><th>${t('col_status')}</th><th class="num">${t('col_score')}</th></tr></thead>
          <tbody>
          ${risk.map((w) => `<tr>
              <td><a href="#/dialog/${encodeURIComponent(w.conversation_id)}" style="font-weight:600">${esc(w.conversation_id)}</a></td>
              <td>${w.gross ? `<span class="badge gross">${t('gross_error')}</span>` : ''}</td>
              <td class="num"><span class="score-pill ${scoreClass(w.total)}">${fmtScore(w.total)}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="card-head"><h3>${t('lang_title')}</h3></div>
        <table class="dt">
          <thead><tr><th>${t('col_lang')}</th><th class="num">${t('kpi_dialogs')}</th><th class="num">${t('kpi_evaluated')}</th><th class="num">${t('col_avg')}</th></tr></thead>
          <tbody>
          ${s.by_language.map((l) => `<tr>
              <td><a href="#/dialogs?lang=${l.language}" style="font-weight:600">${l.language}</a></td>
              <td class="num">${l.conversations}</td>
              <td class="num">${l.evaluated}</td>
              <td class="num">${fmtScore(l.average)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>` : `<div class="card">${emptyState('bolt', t('nothing_yet'), t('nothing_yet_text'), `<button class="btn btn-primary" id="run-all-2">${t('evaluate_all')}</button>`)}</div>`}
  `;

  const runAll = async () => {
    await runEvaluation({ group_id: '*', checklist_id: activeChecklist()?.id });
    if (isViewAlive(token)) render(view, params, query, token);
  };
  $('#run-all')?.addEventListener('click', runAll);
  view.querySelector('#run-all-2')?.addEventListener('click', runAll);
}

function stat(label, value, sub, cls = '', unit = '') {
  return `<div class="stat ${cls}">
    <div class="s-label">${esc(label)}</div>
    <div class="s-val">${value === null || value === undefined ? '—' : esc(value)}${unit && value !== '—' ? `<small>${esc(unit)}</small>` : ''}</div>
    <div class="s-sub">${esc(sub)}</div>
  </div>`;
}
