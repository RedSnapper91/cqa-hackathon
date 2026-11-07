import { api } from "../api.js";
import { t } from "../i18n.js";
import {
  esc,
  icon,
  ans,
  answerOptions,
  fmtDate,
  fmtTs,
  fmtScore,
  toast,
  modal,
  emptyState,
  $,
} from "../ui.js";
import { refreshMeta, isViewAlive } from "../state.js";

export async function render(view, params, query, token) {
  const { appeals } = await api.appeals();
  if (!isViewAlive(token)) return;
  if (!appeals.length) {
    view.innerHTML = `<div class="card">${emptyState("appeal", t("no_appeals"), t("no_appeals_text"), `<a class="btn btn-primary" href="#/dialogs">${icon("dialogs")} ${t("open_dialogs")}</a>`)}</div>`;
    return;
  }
  const openList = appeals.filter((a) => a.status === "open");
  const closed = appeals.filter((a) => a.status !== "open");

  view.innerHTML = `
    <div class="board">
      <section><div class="col-head"><span class="dot"></span>${t("open_col")} <span class="badge warn">${openList.length}</span></div>
        ${openList.map(card).join("") || `<div class="card muted">—</div>`}</section>
      <section><div class="col-head"><span class="dot live" style="animation:none"></span>${t("closed_col")} <span class="badge ok">${closed.length}</span></div>
        ${closed.map(card).join("") || `<div class="card muted">—</div>`}</section>
    </div>`;

  view.onclick = (e) => {
    const b = e.target.closest("[data-review]");
    if (!b || b.disabled) return;
    b.disabled = true;
    b.innerHTML = '<span class="spin"></span>';
    review(
      appeals.find((a) => a.id === b.dataset.review),
      view,
      token,
    ).finally(() => {
      b.disabled = false;
      b.innerHTML = `${icon("target")} ${t("review")}`;
    });
  };
  if (query.id) {
    const a = appeals.find((x) => x.id === query.id && x.status === "open");
    if (a) review(a, view, token);
  }
}

function card(a) {
  const c = a.criterion;
  const dir =
    a.total_after != null && a.total_before != null
      ? a.total_after - a.total_before
      : 0;
  return `<article class="ap-card">
    <div class="row" style="justify-content:space-between">
      <div class="row" style="gap:8px">
        <a class="mono" style="font-weight:800" href="#/dialog/${encodeURIComponent(a.conversation_id)}?ev=${a.evaluation_id}&crit=${a.criterion_id}">${esc(a.external_id || a.conversation_id)}</a>
        <span class="badge lang-${a.language}">${a.language}</span>
      </div>
      <span class="muted" style="font-size:12px">${fmtDate(a.created_at)}</span>
    </div>
    <div class="row" style="margin-top:10px;gap:8px">
      <span class="mono muted" style="font-weight:800">${esc(c?.code)}</span><b>${esc(c?.title)}</b>
      <span style="margin-left:auto" class="row">${ans(c, a.original_answer)}${a.requested_answer != null && a.status === "open" ? ` <span class="arrow">→ ${t("requested")}</span> ${ans(c, a.requested_answer)}` : ""}${a.status === "changed" ? ` <span class="arrow">→</span> ${ans(c, a.decision.new_answer)}` : ""}</span>
    </div>
    ${
      a.evidence?.length
        ? `<div class="quote">${a.evidence
            .slice(0, 2)
            .map(
              (l) =>
                `<div><b>${t(l.speaker)}</b> <span class="muted mono">#${l.idx}</span> ${esc(l.text.length > 160 ? l.text.slice(0, 159) + "…" : l.text)}</div>`,
            )
            .join("")}</div>`
        : ""
    }
    <p class="comment">💬 «${esc(a.comment)}» <span class="muted">— ${esc(a.author)}</span></p>
    ${a.decision ? `<div class="appeal-note ${a.status}" style="margin-top:10px"><b>${a.status === "changed" ? t("appeal_changed") : t("appeal_upheld")}</b><div class="muted">${t("reason")}: ${esc(a.decision.reason)} — ${esc(a.decision.reviewer)}</div></div>` : ""}
    <div class="row" style="justify-content:space-between;margin-top:12px">
      <span class="row" style="gap:8px"><span class="muted" style="font-size:12px">${t("total_change")}</span>
        <span class="mono">${fmtScore(a.total_before)}</span>
        ${a.status !== "open" ? `<span class="arrow">→</span><span class="delta ${dir > 0 ? "up" : dir < 0 ? "down" : ""}">${fmtScore(a.total_after)}${dir ? ` (${dir > 0 ? "+" : ""}${fmtScore(Math.round(dir * 100) / 100)})` : ""}</span>` : ""}
      </span>
      ${a.status === "open" ? `<button class="btn btn-primary btn-sm" data-review="${a.id}">${icon("target")} ${t("review")}</button>` : ""}
    </div>
  </article>`;
}

async function review(a, view, token) {
  const { conversation: conv } = await api.conversation(a.conversation_id);
  const c = a.criterion;
  const v = a.verdict || {};
  const focus = new Set(v.evidence || []);
  let lo, hi;
  const pts = [...focus, ...(v.checked_range || [])];
  if (pts.length) {
    lo = Math.max(0, Math.min(...pts) - 2);
    hi = Math.min(conv.transcript.length - 1, Math.max(...pts) + 2);
  } else {
    lo = 0;
    hi = conv.transcript.length - 1;
  }
  const lines = conv.transcript.slice(lo, hi + 1);

  const m = modal(
    `
    <h3>${t("reviewer_title")}</h3>
    <p class="muted" style="margin:0 0 16px"><span class="mono">${esc(a.external_id || a.conversation_id)}</span> · ${esc(c.code)} ${esc(c.title)}</p>
    <div class="stack">
      <div class="card" style="padding:14px">
        <div class="row" style="justify-content:space-between"><b>${t("appeal_current")}</b>${ans(c, a.original_answer)}</div>
        <p style="margin:8px 0 0;color:var(--text-2);font-size:13px">${esc(v.explanation || "")}</p>
      </div>
      <div class="field"><span>${t("fragment")}</span>
        <div class="context-lines">${lines.map((l) => `<div class="cl-line ${focus.has(l.idx) ? "hit" : ""}"><span class="mono muted">#${l.idx} ${esc(fmtTs(l.timestamp))}</span> <b class="${l.speaker === "operator" ? "role-op" : l.speaker === "client" ? "role-cl" : "muted"}">${t(l.speaker)}:</b> ${esc(l.text)}</div>`).join("")}</div>
      </div>
      <div class="card" style="padding:14px;border-color:color-mix(in srgb,var(--warn) 40%,transparent)"><b>${t("comment")}:</b> «${esc(a.comment)}» <span class="muted">— ${esc(a.author)}</span>
        ${a.requested_answer != null ? `<div style="margin-top:6px">${t("requested")}: ${ans(c, a.requested_answer)}</div>` : ""}</div>
      <div class="field"><span>${t("decision")}</span>
        <div class="radio-cards">
          <label class="radio-card"><input type="radio" name="d" value="upheld" checked> <b>${t("uphold")}</b><span class="muted">${t("uphold_text")}</span></label>
          <label class="radio-card"><input type="radio" name="d" value="changed" ${a.requested_answer != null ? "checked" : ""}> <b>${t("change")}</b><span class="muted">${t("change_text")}</span></label>
        </div></div>
      <label class="field" id="nv-wrap"><span>${t("new_value")}</span><select class="select" id="nv">${answerOptions(c, a.requested_answer ?? a.original_answer)}</select></label>
      <label class="field"><span>${t("reason")}</span><textarea class="textarea" id="reason" rows="3"></textarea></label>
      <label class="field"><span>${t("reviewer")}</span><input class="input" id="reviewer" value="Проверяющий QA"></label>
    </div>
    <div class="m-actions"><button class="btn" data-close>${t("cancel")}</button><button class="btn btn-primary" id="decide">${icon("check")} ${t("save_decision")}</button></div>`,
    { wide: true },
  );

  const sync = () => {
    $("#nv-wrap", m.el).classList.toggle(
      "hidden",
      $('input[name="d"]:checked', m.el).value !== "changed",
    );
  };
  sync();
  m.el.addEventListener("change", (e) => e.target.name === "d" && sync());
  $("#decide", m.el).onclick = async () => {
    try {
      const decision = $('input[name="d"]:checked', m.el).value;
      const r = await api.decide(a.id, {
        decision,
        new_answer: $("#nv", m.el).value,
        reason: $("#reason", m.el).value,
        reviewer: $("#reviewer", m.el).value,
      });
      m.close();
      toast(
        `${t("decided")}: ${fmtScore(a.total_before)} → ${fmtScore(r.appeal.total_after)}`,
      );
      await refreshMeta();
      if (isViewAlive(token)) render(view, [], {}, token);
    } catch (e) {
      toast(e.message, "err");
    }
  };
}
