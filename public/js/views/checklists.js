import { api } from '../api.js';
import { t } from '../i18n.js';
import { esc, icon, fmtDate, toast, modal, $, $$ } from '../ui.js';
import { state, refreshMeta, runEvaluation, isViewAlive } from '../state.js';
import { computeScore, round2 } from '/lib/scoring.js';

const COLORS = ['#16a34a', '#0f5431', '#64748b', '#b45309', '#0369a1', '#9ca3af', '#475569'];
const RULE_LABEL = {
  greeting: 'Приветствие и представление', needs: 'Уточняющие вопросы', identification: 'Идентификация', consultation: 'Полнота консультации',
  empathy: 'Эмпатия / вежливость', dialog: 'Ведение диалога', closing: 'Прощание', gross: 'Грубые нарушения', keywords: null,
};

let selId = null;
let draft = null;
let baseId = null;
let dirty = false;
const open = new Set();
const sandboxNA = new Set();

const rid = () => 'c_' + Math.random().toString(36).slice(2, 8);

function load(cl) {
  selId = cl ? cl.id : null;
  baseId = cl ? cl.id : null;
  draft = cl
    ? structuredClone({ name: cl.name, note: '', sections: cl.sections, criteria: cl.criteria })
    : { name: 'Новый чек-лист', note: '', sections: [{ id: 's1', title: 'Основное' }], criteria: [] };
  dirty = !cl;
  sandboxNA.clear();
}

export async function render(view, params, query, token) {
  await refreshMeta();
  if (!isViewAlive(token)) return;
  const target = state.checklists.find((c) => c.id === (params[0] || selId)) || state.checklists.find((c) => c.id === state.active_checklist_id);
  if (!draft || (target && target.id !== selId && !dirty) || params[0]) load(target);

  view.innerHTML = `<div class="cl-layout"><aside class="versions" id="versions"></aside><section id="editor"></section></div>`;
  drawVersions(view);
  drawEditor(view, token);
}

function drawVersions(view) {
  $('#versions', view).innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:4px"><b>${t('versions')}</b>
      <button class="btn btn-sm" id="new-cl">+ ${t('new_checklist')}</button></div>
    ${state.checklists.map((c) => {
      const sum = c.criteria.filter((x) => x.type !== 'flag').reduce((s, x) => s + Number(x.weight), 0);
      return `<div class="version ${c.id === selId ? 'sel' : ''}" data-id="${c.id}">
        <div class="v-name"><span>${esc(c.name)} <span class="muted mono">v${c.version}</span></span>${c.id === state.active_checklist_id ? `<span class="badge ok">${t('active')}</span>` : ''}</div>
        <div class="v-meta">${c.criteria.length} ${t('criteria').toLowerCase()}, ${t('sum').toLowerCase()} ${sum} · ${fmtDate(c.created_at)}</div>
        ${c.note ? `<div class="v-meta" style="font-style:italic">${esc(c.note)}</div>` : ''}
      </div>`;
    }).join('')}`;
  $('#new-cl', view).onclick = () => { load(null); drawVersions(view); drawEditor(view); };
  $$('.version', view).forEach((v) => (v.onclick = () => {
    if (dirty && !confirm(`${t('unsaved')}. OK?`)) return;
    load(state.checklists.find((c) => c.id === v.dataset.id));
    drawVersions(view);
    drawEditor(view);
  }));
}

function weightsHtml() {
  const answers = {};
  for (const c of draft.criteria) answers[c.id] = sandboxNA.has(c.id) && c.allow_na ? 'na' : c.type === 'scale' ? Math.max(...(c.scale || [{ value: 1 }]).map((s) => Number(s.value))) : c.type === 'flag' ? 'no' : 'yes';
  const sc = computeScore(draft, answers);
  const scored = draft.criteria.filter((c) => c.type !== 'flag' && Number(c.weight) > 0);
  const sum = round2(scored.reduce((s, c) => s + Number(c.weight), 0));
  const color = (c) => COLORS[Math.max(0, draft.sections.findIndex((s) => s.id === c.section)) % COLORS.length];
  return `
    <div class="card-head"><h3>${t('weights')}</h3><span class="w-sum" style="color:${sum === 100 ? 'var(--brand)' : 'var(--warn)'}">${t('sum')}: ${sum}${sum === 100 ? '' : ' ≠ 100'}</span></div>
    <div class="wbar">
      ${scored.map((c) => {
        const r = sc.rows.find((x) => x.criterion_id === c.id);
        const na = sandboxNA.has(c.id) && c.allow_na;
        return `<div class="seg-w ${na ? 'na' : ''}" data-na="${c.id}" title="${esc(c.title)}: ${c.weight} → ${na ? 'N/A' : r.effective_weight}" style="flex-grow:${na ? 0.0001 : r.effective_weight};background:${color(c)}">${na ? '' : `${fmtW(r.effective_weight)}`}</div>`;
      }).join('')}
    </div>
    <div class="w-legend">
      ${scored.filter((c) => c.allow_na).map((c) => `<label><input type="checkbox" class="cb" data-na="${c.id}" ${sandboxNA.has(c.id) ? 'checked' : ''} style="width:15px;height:15px"> N/A ${esc(c.code)} ${esc(c.title)}</label>`).join('')}
    </div>
    <div class="muted" style="font-size:12px;margin-top:8px">${t('weights_hint')}</div>`;
}
const fmtW = (v) => (Number.isInteger(v) ? v : v.toFixed(1));

function drawEditor(view) {
  const ed = $('#editor', view);
  const isActive = selId && selId === state.active_checklist_id;
  ed.innerHTML = `
    <div class="card">
      <div class="row" style="align-items:flex-end">
        <label class="field grow"><span>${t('cl_name')}</span><input class="input" data-k="name" value="${esc(draft.name)}"></label>
        <label class="field grow"><span>${t('cl_note')}</span><input class="input" data-k="note" value="${esc(draft.note)}" placeholder="напр. «Заменён критерий 05»"></label>
      </div>
      <div class="row" style="margin-top:14px;justify-content:space-between">
        <div class="row">${dirty ? `<span class="badge warn">${t('unsaved')}</span>` : ''}</div>
        <div class="row">
          ${selId && !isActive && !dirty ? `<button class="btn" id="activate">${icon('check')} ${t('make_active')}</button>` : ''}
          ${selId && !dirty ? `<button class="btn" id="apply">${icon('bolt')} ${t('apply_to')}</button>` : ''}
          <button class="btn btn-primary" id="save" ${dirty ? '' : 'disabled'}>${icon('check')} ${t('save_version')}</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px" id="weights">${weightsHtml()}</div>

    <div class="card" style="margin-top:14px">
      <div class="card-head"><h3>${t('sections')}</h3><button class="btn btn-sm" id="add-sec">+ ${t('add_section')}</button></div>
      <div class="row">${draft.sections.map((s, i) => `
        <div class="sec-tag">
          <i style="background:${COLORS[i % COLORS.length]}"></i>
          <input class="input" data-sec="${s.id}" value="${esc(s.title)}" style="width:${Math.max(10, s.title.length + 2)}ch">
          ${draft.sections.length > 1 ? `<button class="btn btn-ghost btn-sm ic" data-delsec="${s.id}" title="${t('cancel')}">${icon('x')}</button>` : ''}
        </div>`).join('')}</div>
    </div>

    <div style="margin-top:18px" class="row"><h3 style="margin:0;font-size:16px;font-weight:700">${t('criteria')} <span class="muted" style="font-weight:400">(${draft.criteria.length})</span></h3></div>
    <div id="crits">${draft.criteria.map((c, i) => critEditor(c, i)).join('')}</div>
    <button class="btn add-row" id="add-crit">+ ${t('add_criterion')}</button>
  `;
  bindEditor(view);
}

function critEditor(c, i) {
  const isOpen = open.has(c.id);
  const secIdx = Math.max(0, draft.sections.findIndex((s) => s.id === c.section));
  const typeLabel = { binary: t('t_binary'), scale: t('t_scale'), flag: t('t_flag') }[c.type];
  return `<div class="c-editor ${isOpen ? 'open' : ''}" data-ci="${i}">
    <div class="c-row" data-toggle="${c.id}">
      <span class="c-code">${esc(c.code)}</span>
      <div style="min-width:0"><div class="c-title"><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${COLORS[secIdx % COLORS.length]};margin-right:8px;vertical-align:1px"></i>${esc(c.title)}</div>
        <div class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.description)}</div></div>
      <span class="badge">${typeLabel}${c.allow_na ? ', N/A' : ''}</span>
      <span class="mono c-w">${c.type === 'flag' ? '—' : c.weight}</span>
      <div class="tools">
        <button class="btn btn-ghost btn-sm ic" data-act="up" title="↑" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button class="btn btn-ghost btn-sm ic" data-act="down" title="↓" ${i === draft.criteria.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
        <button class="btn btn-ghost btn-sm ic" data-act="dup" title="Копировать">${icon('copy')}</button>
        <button class="btn btn-ghost btn-sm ic" data-act="del" title="Удалить" style="color:var(--no)">${icon('trash')}</button>
      </div>
    </div>
    ${isOpen ? `<div class="c-body">
      <label class="field"><span>${t('c_title')}</span><input class="input" data-f="title" value="${esc(c.title)}"></label>
      <div class="row" style="align-items:flex-end">
        <label class="field" style="width:80px"><span>Код</span><input class="input mono" data-f="code" value="${esc(c.code)}"></label>
        <label class="field grow"><span>${t('c_section')}</span><select class="select" data-f="section">${draft.sections.map((s) => `<option value="${s.id}" ${s.id === c.section ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</select></label>
      </div>
      <div class="field"><span>${t('c_type')}</span>
        <div class="seg" data-f="type">${['binary', 'scale', 'flag'].map((tp) => `<button type="button" data-v="${tp}" class="${c.type === tp ? 'on' : ''}">${{ binary: t('t_binary'), scale: t('t_scale'), flag: t('t_flag') }[tp]}</button>`).join('')}</div></div>
      <div class="row" style="align-items:flex-end">
        ${c.type !== 'flag' ? `<label class="field grow"><span>${t('c_weight')}: <b class="mono" data-wl>${c.weight}</b></span>
          <div class="row" style="flex-wrap:nowrap"><input type="range" min="0" max="50" step="1" data-f="weight" value="${c.weight}" class="grow"><input class="input mono" data-f="weight" value="${c.weight}" style="width:70px"></div></label>` : ''}
        ${c.type !== 'flag' ? `<label class="switch" style="padding-bottom:10px"><input type="checkbox" data-f="allow_na" ${c.allow_na ? 'checked' : ''}> ${t('c_allow_na')}</label>` : ''}
      </div>
      <label class="field full"><span>${t('c_desc')}</span><textarea class="textarea" data-f="description" rows="2">${esc(c.description)}</textarea></label>
      ${c.allow_na && c.type !== 'flag' ? `<label class="field full"><span>${t('c_na')}</span><textarea class="textarea" data-f="na_rule" rows="2">${esc(c.na_rule)}</textarea></label>` : ''}
      ${c.type === 'scale' ? `<div class="field full"><span>${t('c_scale')}</span><div class="scale-rows">
        ${(c.scale || []).map((s, si) => `<div class="scale-row"><input class="input mono" data-step="${si}" data-sf="value" value="${s.value}"><input class="input" data-step="${si}" data-sf="label" value="${esc(s.label)}"><button class="btn btn-ghost btn-sm ic" data-delstep="${si}">${icon('x')}</button></div>`).join('')}
        <button class="btn btn-sm" data-addstep style="align-self:flex-start">+ ${t('add_step')}</button></div></div>` : ''}
      <label class="field"><span>${t('c_rule')}</span><select class="select" data-f="rule">${state.rule_types.map((r) => `<option value="${r}" ${r === c.rule ? 'selected' : ''}>${RULE_LABEL[r] || t('rule_keywords')}</option>`).join('')}</select></label>
      ${c.rule === 'keywords' ? `<label class="field"><span>${t('c_keywords')}</span><input class="input" data-f="keywords" value="${esc(c.keywords || '')}" placeholder="подождите, минуту, one moment, күте тұрыңыз"></label>` : '<div></div>'}
    </div>` : ''}
  </div>`;
}

function markDirty(view) {
  if (!dirty) {
    dirty = true;
    const save = $('#save', view);
    if (save) save.disabled = false;
    $('#activate', view)?.remove();
    $('#apply', view)?.remove();
  }
}

function bindEditor(view) {
  const ed = $('#editor', view);
  const redraw = () => drawEditor(view);
  const refreshWeights = () => { $('#weights', view).innerHTML = weightsHtml(); };

  ed.oninput = (e) => {
    const el = e.target;
    if (el.dataset.k) { draft[el.dataset.k] = el.value; markDirty(view); return; }
    if (el.dataset.sec) { draft.sections.find((s) => s.id === el.dataset.sec).title = el.value; el.style.width = Math.max(10, el.value.length + 2) + 'ch'; markDirty(view); return; }
    const box = el.closest('[data-ci]');
    if (!box) return;
    const c = draft.criteria[Number(box.dataset.ci)];
    if (el.dataset.f === 'weight') {
      c.weight = Math.max(0, Number(el.value) || 0);
      $$('[data-f="weight"]', box).forEach((x) => x !== el && (x.value = c.weight));
      $('[data-wl]', box).textContent = c.weight;
      $('.c-row .mono', box).textContent = c.weight;
      refreshWeights();
    } else if (el.dataset.sf) {
      const s = c.scale[Number(el.dataset.step)];
      s[el.dataset.sf] = el.dataset.sf === 'value' ? Number(el.value) : el.value;
    } else if (el.dataset.f && el.type !== 'checkbox' && el.tagName !== 'SELECT') {
      c[el.dataset.f] = el.value;
      if (el.dataset.f === 'title') $('.c-title', box).lastChild.textContent = el.value;
    }
    markDirty(view);
  };

  ed.onchange = (e) => {
    const el = e.target;
    if (el.dataset.na && el.type === 'checkbox') { el.checked ? sandboxNA.add(el.dataset.na) : sandboxNA.delete(el.dataset.na); refreshWeights(); return; }
    const box = el.closest('[data-ci]');
    if (!box) return;
    const c = draft.criteria[Number(box.dataset.ci)];
    if (el.dataset.f === 'allow_na') { c.allow_na = el.checked; markDirty(view); redraw(); }
    else if (el.tagName === 'SELECT' && el.dataset.f) { c[el.dataset.f] = el.value; markDirty(view); redraw(); }
  };

  ed.onclick = async (e) => {
    const naSeg = e.target.closest('.seg-w[data-na]');
    if (naSeg) {
      const c = draft.criteria.find((x) => x.id === naSeg.dataset.na);
      if (c?.allow_na) { sandboxNA.has(c.id) ? sandboxNA.delete(c.id) : sandboxNA.add(c.id); refreshWeights(); }
      return;
    }
    const box = e.target.closest('[data-ci]');
    const idx = box ? Number(box.dataset.ci) : -1;
    const c = idx >= 0 ? draft.criteria[idx] : null;
    const act = e.target.closest('[data-act]');
    if (act && c) {
      e.stopPropagation();
      const a = act.dataset.act;
      if (a === 'up' && idx > 0) [draft.criteria[idx - 1], draft.criteria[idx]] = [draft.criteria[idx], draft.criteria[idx - 1]];
      if (a === 'down' && idx < draft.criteria.length - 1) [draft.criteria[idx + 1], draft.criteria[idx]] = [draft.criteria[idx], draft.criteria[idx + 1]];
      if (a === 'dup') { const n = { ...structuredClone(c), id: rid(), title: c.title + ' (копия)' }; draft.criteria.splice(idx + 1, 0, n); open.add(n.id); }
      if (a === 'del') { if (!confirm(`«${c.title}» — удалить?`)) return; draft.criteria.splice(idx, 1); }
      markDirty(view); redraw(); return;
    }
    const seg = e.target.closest('.seg[data-f="type"] [data-v]');
    if (seg && c) {
      c.type = seg.dataset.v;
      if (c.type === 'flag') { c.weight = 0; c.allow_na = false; }
      if (c.type === 'scale' && !(c.scale || []).length) c.scale = [{ value: 10, label: 'Полностью' }, { value: 5, label: 'Частично' }, { value: 0, label: 'Нет' }];
      if (c.type !== 'flag' && !c.weight) c.weight = 10;
      markDirty(view); redraw(); return;
    }
    if (e.target.closest('[data-addstep]') && c) { c.scale.push({ value: 0, label: '' }); markDirty(view); redraw(); return; }
    const ds = e.target.closest('[data-delstep]');
    if (ds && c) { c.scale.splice(Number(ds.dataset.delstep), 1); markDirty(view); redraw(); return; }
    const tg = e.target.closest('[data-toggle]');
    if (tg) { open.has(tg.dataset.toggle) ? open.delete(tg.dataset.toggle) : open.add(tg.dataset.toggle); redraw(); return; }
    const delsec = e.target.closest('[data-delsec]');
    if (delsec) {
      const id = delsec.dataset.delsec;
      draft.sections = draft.sections.filter((s) => s.id !== id);
      draft.criteria.forEach((x) => x.section === id && (x.section = draft.sections[0].id));
      markDirty(view); redraw(); return;
    }
    if (e.target.closest('#add-sec')) { draft.sections.push({ id: 's' + Math.random().toString(36).slice(2, 6), title: 'Новая секция' }); markDirty(view); redraw(); return; }
    if (e.target.closest('#add-crit')) {
      const n = { id: rid(), code: String(draft.criteria.length + 1).padStart(2, '0'), section: draft.sections[0].id, type: 'binary', weight: 10, allow_na: false, title: 'Новый критерий', description: 'Да — ', na_rule: '', rule: 'keywords', keywords: '' };
      draft.criteria.push(n); open.add(n.id); markDirty(view); redraw();
      setTimeout(() => $(`[data-ci="${draft.criteria.length - 1}"] [data-f="title"]`, view)?.select(), 30);
      return;
    }
    if (e.target.closest('#save')) {
      try {
        const cl = await api.saveChecklist({ ...draft, base_id: baseId, activate: true });
        toast(`${t('saved_version')}: ${cl.name} v${cl.version}`);
        await refreshMeta();
        load(cl);
        drawVersions(view); redraw();
      } catch (err) { toast(err.message, 'err'); }
      return;
    }
    if (e.target.closest('#activate')) {
      await api.activateChecklist(selId);
      toast(t('activated'));
      await refreshMeta();
      drawVersions(view); redraw();
      return;
    }
    if (e.target.closest('#apply')) openApply(view);
  };
}

async function openApply(view) {
  const st = await api.stats();
  const cl = state.checklists.find((c) => c.id === selId);
  const m = modal(`
    <h3>${t('apply_title')}</h3>
    <p class="muted" style="margin:0 0 16px">${esc(cl.name)} v${cl.version} — ${t('apply_text')}</p>
    <div class="field"><span>${t('apply_scope')}</span>
      <div class="radio-cards">
        <label class="radio-card"><input type="radio" name="g" value="*" checked> <b>${t('apply_all')}</b><span class="muted">${st.conversations}</span></label>
        ${st.datasets.map((d) => `<label class="radio-card"><input type="radio" name="g" value="${esc(d.group_id)}"> <b class="mono">${esc(d.group_id)}</b><span class="muted">${d.count}</span></label>`).join('')}
      </div></div>
    <div class="m-actions"><button class="btn" data-close>${t('cancel')}</button><button class="btn btn-primary" id="go">${icon('bolt')} ${t('apply_to')}</button></div>`);
  $('#go', m.el).onclick = async () => {
    const g = $('input[name="g"]:checked', m.el).value;
    m.close();
    await runEvaluation({ group_id: g, checklist_id: cl.id });
    location.hash = '#/dialogs';
  };
  void view;
}
