// "How to check" — a step-by-step walkthrough for reviewers. Each step is ticked
// automatically from server state (and from which screens the reviewer has opened).
import { api } from '../api.js';
import { t } from '../i18n.js';
import { esc, icon, toast, $, scoreClass, fmtScore } from '../ui.js';
import { state, refreshMeta, runEvaluation, isViewAlive, activeChecklist } from '../state.js';

const SEEN_KEY = 'cqa.guide.seen';
export function markSeen(name) {
  try {
    const seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
    if (seen.has(name)) return;
    seen.add(name);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {}
}
function seen(name) {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]').includes(name); } catch { return false; }
}
const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export async function render(view, params, query, token) {
  const [st, cv] = await Promise.all([api.stats(), api.conversations()]);
  if (!isViewAlive(token)) return;
  const convs = cv.conversations;
  const evaluated = convs.filter((c) => c.evaluation);
  const cl = activeChecklist();
  const familyVersions = state.checklists.filter((c) => c.family === cl?.family).length;
  const decided = st.appeals_total - st.appeals_open;

  const done = [
    st.datasets.some((d) => d.source === 'upload' || d.group_id !== 'DEV'),
    seen('checklists') || state.checklists.length > 1,
    st.evaluated > 0,
    seen('dialog'),
    decided > 0,
    evaluated.some((c) => c.evaluation.checklist_version > 1),
  ];
  const doneCount = done.filter(Boolean).length;
  const current = done.findIndex((d) => !d);

  // Quick picks for step 4: one representative dialog per interesting case.
  const pick = (fn) => evaluated.find(fn);
  const lowest = [...evaluated].filter((c) => c.evaluation.final_total !== null).sort((a, b) => a.evaluation.final_total - b.evaluation.final_total)[0];
  const picks = [
    ['alert', t('pick_gross'), pick((c) => c.evaluation.gross_error), 'danger'],
    ['target', t('pick_na'), pick((c) => c.evaluation.na_count > 0), ''],
    ['phone', t('pick_call'), pick((c) => c.has_audio), ''],
    ['down', t('pick_low'), lowest, ''],
  ].filter((p) => p[2]);

  const sets = st.datasets.map((d) => `<option value="${esc(d.group_id)}">${esc(d.group_id)} · ${d.count}</option>`).join('');

  const body = [
    // 1. Load
    `<label class="drop big" id="g-drop">
        <div class="drop-title">${t('drop_title')}</div>
        <div>JSON · <span class="mono">{ "data": { "records": [ … ] } }</span></div>
        <input type="file" id="g-file" accept=".json,application/json" hidden>
      </label>
      <div class="row" style="flex-wrap:nowrap">
        <input class="input mono" id="g-group" placeholder="group_id — ${esc(t('or_group'))}">
        <button class="btn" id="g-load">${icon('download')} ${t('load')}</button>
      </div>
      <label class="g-check"><input type="checkbox" id="g-auto" checked> ${t('auto_eval')}</label>
      <div id="g-upload-res"></div>`,
    // 2. Checklist
    `<div class="kv">
        <span>${t('active_checklist')}: <b>${esc(cl?.name)} · v${cl?.version}</b></span>
        <span>${t('criteria')}: <b>${cl?.criteria.length ?? 0}</b></span>
        <span>${fmt(t('versions_count'), { n: `<b>${familyVersions}</b>` })}</span>
      </div>
      <div class="step-links"><a class="btn btn-sm" href="#/checklists">${icon('checklist')} ${t('go_checklists')}</a></div>`,
    // 3. Evaluate
    `<div class="row" style="flex-wrap:nowrap;align-items:flex-end">
        <label class="field grow"><span>${t('set_scope')}</span>
          <select class="select" id="g-set"><option value="*">${t('apply_all')} · ${st.conversations}</option>${sets}</select></label>
        <button class="btn btn-primary" id="g-eval">${icon('bolt')} ${t('evaluate')}</button>
      </div>
      <div class="g-meter"><i style="width:${st.conversations ? (st.evaluated / st.conversations) * 100 : 0}%"></i></div>
      <div class="kv"><span>${fmt(t('evaluated_of'), { a: `<b>${st.evaluated}</b>`, b: `<b>${st.conversations}</b>` })}</span></div>`,
    // 4. Result + evidence
    `${picks.length ? `<div class="mini-list">${picks.map(([ic, label, c]) => `
        <a href="#/dialog/${encodeURIComponent(c.conversation_id)}">
          <span style="min-width:0;flex:1"><span class="mono" style="font-weight:700;display:block;overflow:hidden;text-overflow:ellipsis">${esc(c.conversation_id)}</span><span class="why">${esc(label)}</span></span>
          <span class="score-pill ${scoreClass(c.evaluation.final_total)}">${fmtScore(c.evaluation.final_total)}</span>
        </a>`).join('')}</div>` : `<p class="muted" style="margin:0">${t('no_eval_text')}</p>`}
      <div class="tip">${icon('target')}<span>${t('s4_tip')}</span></div>`,
    // 5. Appeals
    `<div class="kv"><span>${fmt(t('appeals_status'), { a: `<b>${st.appeals_total}</b>`, b: `<b>${decided}</b>` })}</span></div>
      <div class="step-links"><a class="btn btn-sm" href="#/appeals">${icon('appeal')} ${t('go_appeals')}</a></div>`,
    // 6. New checklist version
    `<div class="step-links"><a class="btn btn-sm" href="#/checklists">${icon('checklist')} ${t('go_checklists')}</a>
      <a class="btn btn-sm btn-ghost" href="#/dialogs">${icon('dialogs')} ${t('go_dialogs')}</a></div>`,
  ];

  view.innerHTML = `
    <section class="guide-head">
      <p>${t('g_text')}</p>
      <div class="g-progress">
        <div class="num">${doneCount} <span>/ 6</span></div>
        <div class="lbl">${t('g_done')}</div>
        <div class="bar"><i style="width:${(doneCount / 6) * 100}%"></i></div>
      </div>
    </section>
    <ol class="steps">
      ${body.map((html, i) => `
        <li class="step ${done[i] ? 'done' : ''} ${i === current ? 'current' : ''}">
          <div class="s-num">${done[i] ? icon('check') : i + 1}</div>
          <div>
            <h3>${t(`s${i + 1}_title`)}</h3>
            <p class="s-text">${t(`s${i + 1}_text`)}</p>
            <div class="s-body">${html}</div>
          </div>
        </li>`).join('')}
    </ol>`;

  // Step 1: file / group_id
  const afterLoad = async (ids, group) => {
    await refreshMeta();
    if ($('#g-auto', view)?.checked && ids.length) await runEvaluation({ group_id: group, checklist_id: activeChecklist()?.id });
    if (!isViewAlive(token)) return;
    toast(fmt(t('upload_done'), { n: ids.length }));
    const target = ids.length === 1 ? `#/dialog/${encodeURIComponent(ids[0])}` : `#/dialogs`;
    await render(view, params, query, token);
    const res = $('#g-upload-res', view);
    if (res) res.innerHTML = `<div class="upload-result row">${icon('check').replace('<svg', '<svg style="width:18px;height:18px;stroke:var(--brand);fill:none;stroke-width:2.4"')} <b>${fmt(t('upload_done'), { n: ids.length })}</b> <a class="btn btn-sm btn-primary" style="margin-left:auto" href="${target}">${t('open_result')}</a></div>`;
  };
  const handleFile = async (file) => {
    try {
      const payload = JSON.parse(await file.text());
      const r = await api.upload({ payload });
      await afterLoad(r.ids, r.group_id);
    } catch (err) { toast(err.message, 'err'); }
  };
  const drop = $('#g-drop', view);
  $('#g-file', view).onchange = (e) => e.target.files[0] && handleFile(e.target.files[0]);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); });

  $('#g-load', view).onclick = async (e) => {
    const group = $('#g-group', view).value.trim();
    if (!group) return $('#g-group', view).focus();
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span> ${t('load')}`;
    try {
      const r = await api.loadGroup(group);
      await afterLoad(r.ids, r.group_id);
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
      btn.innerHTML = `${icon('download')} ${t('load')}`;
    }
  };

  // Step 3: evaluate
  $('#g-eval', view).onclick = async () => {
    await runEvaluation({ group_id: $('#g-set', view).value, checklist_id: activeChecklist()?.id });
    if (isViewAlive(token)) render(view, params, query, token);
  };
}
