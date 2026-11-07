import { api } from '../api.js';
import { t } from '../i18n.js';
import { esc, icon, ring, animate, ans, answerOptions, fmtDate, fmtTs, fmtScore, toast, modal, emptyState, $, $$ } from '../ui.js';
import { runEvaluation, checklistOptions, isViewAlive, refreshMeta } from '../state.js';

const prefs = { context: true, opOnly: false };

export async function render(view, params, query, token) {
  const id = params[0];
  const data = await api.conversation(id);
  if (!isViewAlive(token)) return;
  const conv = data.conversation;
  const evs = data.evaluations;
  const ev = evs.find((e) => e.id === query.ev) || evs[0] || null;
  const isCall = conv.channel === 'voice call';
  let activeCrit = query.crit || null;

  view.innerHTML = `
    <div class="dlg-head">
      <div class="row">
        <a class="btn btn-ghost btn-sm" href="#/dialogs">${icon('back')} ${t('back')}</a>
        <h2>${esc(conv.conversation_id)}</h2>
        <span class="badge lang-${conv.language}">${conv.language}</span>
        <span class="badge">${icon(isCall ? 'phone' : 'chat')} ${isCall ? t('call') : t('chat')}</span>
        <span class="badge">${icon('db')} ${esc(conv.group_id)}</span>
      </div>
      <div class="row">
        ${evs.length > 1 ? `<select class="select" id="hist" style="width:auto" title="${t('history')}">${evs.map((e, i) => `<option value="${e.id}" ${e.id === ev?.id ? 'selected' : ''}>${i === 0 ? '● ' : ''}${fmtDate(e.created_at)} · ${esc(e.checklist.name)} v${e.checklist.version} · ${fmtScore(e.final_score.total)}</option>`).join('')}</select>` : ''}
        <select class="select" id="cl" style="width:auto;max-width:260px">${checklistOptions()}</select>
        <button class="btn btn-primary" id="run">${icon('bolt')} ${ev ? t('re_evaluate') : t('evaluate')}</button>
      </div>
    </div>
    <div class="split">
      <section class="card transcript">
        <div class="t-head">
          <b>${t('transcript')} <span class="muted mono" style="font-weight:600">· ${conv.transcript.length}</span></b>
          <div class="row" style="gap:14px">
            <label class="switch"><input type="checkbox" id="ctx" ${prefs.context ? 'checked' : ''}> ${t('show_context')}</label>
            <label class="switch"><input type="checkbox" id="oponly" ${prefs.opOnly ? 'checked' : ''}> ${t('operator_only')}</label>
          </div>
        </div>
        ${isCall ? `<div class="audio-card" id="audio-card">
            <div class="row" style="justify-content:space-between"><b>${icon('phone').replace('<svg', '<svg style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;vertical-align:-2px"')} ${t('audio')}</b>
            <a class="btn btn-sm" href="${esc(conv.audio_url)}" target="_blank" rel="noopener">${icon('link')} ${t('open_player')}</a></div>
            <audio id="audio" controls preload="none"></audio>
            <span class="muted" style="font-size:11.5px" id="audio-hint">${t('audio_loading')}</span>
          </div>` : ''}
        <div class="t-body" id="tbody">${conv.transcript.map((l) => msg(l, isCall)).join('')}</div>
      </section>
      <section class="stack" id="result">${ev ? result(ev) : `<div class="card">${emptyState('target', t('no_eval'), t('no_eval_text'), `<button class="btn btn-primary" id="run2">${icon('bolt')} ${t('evaluate')}</button>`)}</div>`}</section>
    </div>`;
  animate(view);

  const tbody = $('#tbody', view);
  const applyPrefs = () => {
    $$('.msg.bot, .msg.system', tbody).forEach((m) => m.classList.toggle('hidden', !prefs.context));
    $$('.msg', tbody).forEach((m) => m.classList.toggle('dim', prefs.opOnly && !m.classList.contains('operator')));
  };
  applyPrefs();
  $('#ctx', view).addEventListener('change', (e) => { prefs.context = e.target.checked; applyPrefs(); });
  $('#oponly', view).addEventListener('change', (e) => { prefs.opOnly = e.target.checked; applyPrefs(); });

  // ---- evidence highlighting
  const highlight = (critId) => {
    activeCrit = critId;
    $$('.crit', view).forEach((c) => c.classList.toggle('active', c.dataset.crit === critId));
    $$('.msg', tbody).forEach((m) => m.classList.remove('evidence', 'inrange'));
    if (!ev || !critId) return;
    const v = ev.criteria.find((c) => c.criterion_id === critId);
    if (!v) return;
    if (v.checked_range) {
      const [a, b] = v.checked_range;
      for (let i = a; i <= b; i++) $(`.msg[data-idx="${i}"]`, tbody)?.classList.add('inrange');
    }
    (v.evidence || []).forEach((i) => $(`.msg[data-idx="${i}"]`, tbody)?.classList.add('evidence'));
    const first = (v.evidence && v.evidence[0]) ?? (v.checked_range && v.checked_range[0]);
    if (first !== undefined && first !== null) scrollTo(first, false);
  };
  const scrollTo = (idx, flash = true) => {
    const el = $(`.msg[data-idx="${idx}"]`, tbody);
    if (!el) return;
    el.classList.remove('hidden');
    tbody.scrollTo({ top: el.offsetTop - tbody.offsetTop - tbody.clientHeight / 3, behavior: 'smooth' });
    if (window.innerWidth < 1280) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  };

  view.onclick = (e) => {
    const chip = e.target.closest('[data-goto]');
    if (chip) {
      e.stopPropagation();
      const idx = Number(chip.dataset.goto);
      scrollTo(idx);
      history.replaceState(null, '', `#/dialog/${encodeURIComponent(conv.conversation_id)}?${new URLSearchParams({ ...(ev ? { ev: ev.id } : {}), msg: idx })}`);
      if (isCall) seek(idx);
      return;
    }
    const range = e.target.closest('[data-range]');
    if (range) { e.stopPropagation(); highlight(range.dataset.range); return; }
    const disp = e.target.closest('[data-dispute]');
    if (disp) { e.stopPropagation(); openAppeal(disp.dataset.dispute); return; }
    const crit = e.target.closest('.crit');
    if (crit) highlight(activeCrit === crit.dataset.crit ? null : crit.dataset.crit);
    const play = e.target.closest('[data-play]');
    if (play) seek(Number(play.dataset.play), true);
  };

  // ---- audio
  let audioReady = null;
  const audio = $('#audio', view);
  if (isCall) {
    audioReady = api.audio(conv.conversation_id).then((r) => {
      if (!isViewAlive(token)) return;
      if (r.src) { audio.src = r.src; $('#audio-hint', view).textContent = t('audio_hint'); }
      else fallbackPlayer();
    }).catch(fallbackPlayer);
  }
  // Server could not reach the recording: embed the organizers' player page instead.
  function fallbackPlayer() {
    if (!isViewAlive(token)) return;
    audio.classList.add('hidden');
    $('#audio-hint', view).textContent = t('audio_fail');
    const f = document.createElement('iframe');
    f.src = conv.audio_url;
    f.title = t('audio');
    f.style.cssText = 'width:100%;height:150px;border:0;border-radius:10px;background:#fff';
    $('#audio-card', view).appendChild(f);
  }
  if (isCall) {
    audio.addEventListener('timeupdate', () => {
      const tt = audio.currentTime;
      let cur = null;
      for (const l of conv.transcript) if (l.t != null && l.t <= tt + 0.3) cur = l.idx;
      $$('.msg.playing', tbody).forEach((m) => m.classList.remove('playing'));
      if (cur !== null) $(`.msg[data-idx="${cur}"]`, tbody)?.classList.add('playing');
    });
  }
  async function seek(idx, play = false) {
    const l = conv.transcript[idx];
    if (!audio || !l || l.t == null) return;
    await audioReady;
    if (!audio.src) return;
    audio.currentTime = Math.max(0, l.t - 0.5);
    if (play) audio.play().catch(() => {});
  }

  // ---- actions
  const evaluateNow = async () => {
    const btn = $('#run', view);
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span> ${t('evaluate')}`;
    try {
      const r = await runEvaluation({ conversation_ids: [conv.conversation_id], checklist_id: $('#cl', view).value });
      await refreshMeta();
      location.hash = `#/dialog/${encodeURIComponent(conv.conversation_id)}?ev=${r.evaluations[0].id}`;
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
    }
  };
  $('#run', view).addEventListener('click', evaluateNow);
  $('#run2', view)?.addEventListener('click', evaluateNow);
  $('#hist', view)?.addEventListener('change', (e) => (location.hash = `#/dialog/${encodeURIComponent(conv.conversation_id)}?ev=${e.target.value}`));

  function openAppeal(critId) {
    const crits = ev.checklist.criteria;
    const m = modal(`
      <h3>${t('appeal_title')}</h3>
      <p class="muted" style="margin:0 0 16px">${esc(conv.conversation_id)} · ${esc(ev.checklist.name)} v${ev.checklist.version}</p>
      <div class="stack">
        <label class="field"><span>${t('appeal_criterion')}</span>
          <select class="select" id="ap-crit">${crits.map((c) => `<option value="${c.id}" ${c.id === critId ? 'selected' : ''}>${esc(c.code)} · ${esc(c.title)}</option>`).join('')}</select></label>
        <div class="row"><span class="muted" style="font-size:12px;font-weight:700">${t('appeal_current')}:</span> <span id="ap-cur"></span></div>
        <label class="field"><span>${t('appeal_requested')}</span><select class="select" id="ap-req"></select></label>
        <label class="field"><span>${t('appeal_comment')}</span><textarea class="textarea" id="ap-comment" rows="4" placeholder="${t('appeal_comment_ph')}"></textarea></label>
        <label class="field"><span>${t('appeal_author')}</span><input class="input" id="ap-author" value="Супервайзер"></label>
      </div>
      <div class="m-actions"><button class="btn" data-close>${t('cancel')}</button><button class="btn btn-primary" id="ap-send">${icon('appeal')} ${t('submit_appeal')}</button></div>`);
    const syncCrit = () => {
      const c = crits.find((x) => x.id === $('#ap-crit', m.el).value);
      const v = ev.criteria.find((x) => x.criterion_id === c.id);
      $('#ap-cur', m.el).innerHTML = ans(c, v?.answer);
      $('#ap-req', m.el).innerHTML = `<option value="">—</option>${answerOptions(c, null)}`;
    };
    syncCrit();
    $('#ap-crit', m.el).addEventListener('change', syncCrit);
    $('#ap-send', m.el).addEventListener('click', async () => {
      try {
        await api.appeal(ev.id, {
          criterion_id: $('#ap-crit', m.el).value,
          comment: $('#ap-comment', m.el).value,
          requested_answer: $('#ap-req', m.el).value || null,
          author: $('#ap-author', m.el).value,
        });
        m.close();
        toast(t('appeal_saved'));
        await refreshMeta();
        render(view, params, { ev: ev.id, crit: $('#ap-crit', m.el).value }, token);
      } catch (e) {
        toast(e.message, 'err');
      }
    });
  }

  if (query.msg !== undefined) setTimeout(() => scrollTo(Number(query.msg)), 200);
  else if (activeCrit) setTimeout(() => highlight(activeCrit), 150);
}

function msg(l, isCall) {
  const role = l.speaker;
  const cls = role === 'operator' ? 'role-op' : role === 'client' ? 'role-cl' : '';
  return `<div class="msg ${role}" data-idx="${l.idx}" id="m-${l.idx}">
    <div class="meta">${isCall && l.t != null ? `<button class="play" data-play="${l.idx}" title="▶ ${l.t}s"><svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg></button>` : ''}
      <span class="${cls}">${t(role)}</span><span class="idx">#${l.idx}</span><span>${esc(fmtTs(l.timestamp))}</span></div>
    <div class="bubble">${esc(l.text)}</div>
  </div>`;
}

function result(ev) {
  const fs = ev.final_score;
  const os = ev.score;
  const crits = ev.checklist.criteria;
  const changed = os.total !== fs.total;
  const flagged = crits.filter((c) => fs.gross_flags.includes(c.id));
  const rowsById = Object.fromEntries(fs.rows.map((r) => [r.criterion_id, r]));
  const appealsBy = {};
  for (const a of ev.appeals) (appealsBy[a.criterion_id] ||= []).push(a);

  return `
    <div class="card">
      <div class="result-hero">
        ${ring(fs.total, { size: 150, stroke: 12, label: t('total') })}
        <div class="facts">
          ${changed ? `<div class="row" style="gap:8px"><span class="muted" style="font-size:12px">${t('original')}</span><span class="strike">${fmtScore(os.total)}</span><span class="arrow">→</span><b class="mono" style="color:var(--info)">${fmtScore(fs.total)}</b><span class="muted" style="font-size:12px">${t('final')}</span></div>` : ''}
          <div style="font-weight:800;font-size:15px">${esc(ev.checklist.name)} <span class="muted">v${ev.checklist.version}</span></div>
          <div class="row" style="gap:6px">
            <span class="badge ${ev.engine === 'model' ? 'ok' : 'info'}">${icon('cpu')} ${ev.engine === 'model' ? esc(ev.model) : t('engine_stub')}</span>
            <span class="badge">${fmtDate(ev.created_at)}</span>
            ${fs.na_count ? `<span class="badge">N/A × ${fs.na_count}</span>` : ''}
          </div>
          ${fs.na_count && fs.total !== null ? `<div class="muted" style="font-size:12.5px">${t('redistributed', { a: fs.applicable_weight, b: fs.configured_weight })}</div>` : ''}
          ${ev.fallback_reason ? `<div class="muted" style="font-size:12px">⚠ ${esc(ev.fallback_reason)}</div>` : ''}
        </div>
      </div>
      ${flagged.length ? `<div class="gross-banner">${icon('alert')}<div><b>${t('gross_error')}</b> — ${flagged.map((c) => esc(c.title)).join(', ')}<div class="muted" style="font-size:12.5px">${t('gross_text')}</div></div></div>` : ''}
      <div class="sections">
        ${fs.sections.filter((s) => s.has_scored).map((s) => `
          <div class="section-box">
            <div class="s-title">${esc(s.title)}</div>
            <div class="s-val">${s.max ? `${fmtScore(s.points)} <span class="muted" style="font-size:12px">/ ${fmtScore(s.max)}</span>` : 'N/A'}</div>
            <div class="mini-track"><i style="width:${s.percent ?? 0}%"></i></div>
          </div>`).join('')}
      </div>
    </div>
    ${crits.map((c) => critCard(c, ev, rowsById[c.id], appealsBy[c.id] || [])).join('')}
  `;
}

function critCard(c, ev, row, appeals) {
  const v = ev.criteria.find((x) => x.criterion_id === c.id) || {};
  const finalAnswer = row?.answer;
  const changedAppeal = appeals.find((a) => a.status === 'changed');
  const openAppeal = appeals.find((a) => a.status === 'open');
  const pts = c.type === 'flag' ? '' : row && row.applicable
    ? `<span class="pts"><b>${fmtScore(row.points)}</b> / ${fmtScore(row.effective_weight)} <span title="${t('weight')}">(${t('weight')} ${c.weight})</span></span>`
    : `<span class="pts">— / ${t('weight')} ${c.weight}</span>`;
  const ts = (i) => ev._conv?.transcript?.[i]?.timestamp;
  void ts;
  return `<article class="crit ${c.type === 'flag' && finalAnswer === 'yes' ? 'flag-on' : ''}" data-crit="${c.id}">
    <div class="crit-top">
      <span class="code">${esc(c.code)}</span>
      <h4>${esc(c.title)}</h4>
      ${pts}
      ${changedAppeal ? `<span class="strike">${ans(c, v.answer).replace(/<[^>]+>/g, '')}</span>` : ''}
      ${ans(c, finalAnswer)}
    </div>
    <p class="expl">${esc(v.explanation || '')}</p>
    ${v.na_reason && finalAnswer === 'na' ? `<div class="na-reason"><b>${t('na_reason')}:</b> ${esc(v.na_reason)}</div>` : ''}
    ${(v.evidence?.length || v.checked_range) ? `<div class="ev">
      ${(v.evidence || []).map((i) => `<button class="ev-chip" data-goto="${i}"><span class="mono">#${i}</span> ${t('evidence')}</button>`).join('')}
      ${v.checked_range ? `<button class="ev-chip range" data-range="${c.id}"><span class="mono">#${v.checked_range[0]}–#${v.checked_range[1]}</span> ${t('checked')}</button>` : ''}
    </div>` : ''}
    ${appeals.map((a) => `<div class="appeal-note ${a.status}">
      <b>${a.status === 'open' ? t('appeal_open') : a.status === 'changed' ? t('appeal_changed') : t('appeal_upheld')}</b>
      ${a.status === 'changed' ? ` · ${ans(c, a.original_answer)} → ${ans(c, a.decision.new_answer)}` : ''}
      <div>«${esc(a.comment)}» <span class="muted">— ${esc(a.author)}</span></div>
      ${a.decision ? `<div class="muted">${t('reason')}: ${esc(a.decision.reason)} — ${esc(a.decision.reviewer)}</div>` : ''}
    </div>`).join('')}
    <div class="crit-foot">
      <span class="conf">${v.confidence != null ? `${t('confidence')} <span class="mini-track"><i style="width:${Math.round(v.confidence * 100)}%"></i></span>` : ''}${v.needs_review ? ` <span class="badge warn">${t('needs_review')}</span>` : ''}</span>
      ${openAppeal ? '' : `<button class="btn btn-sm" data-dispute="${c.id}">${icon('appeal')} ${t('dispute')}</button>`}
    </div>
  </article>`;
}
