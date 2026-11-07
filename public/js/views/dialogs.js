import { api } from "../api.js";
import { t } from "../i18n.js";
import {
  esc,
  icon,
  scoreClass,
  fmtScore,
  fmtDate,
  debounce,
  $,
  $$,
  emptyState,
} from "../ui.js";
import {
  runEvaluation,
  checklistOptions,
  isViewAlive,
  state,
} from "../state.js";

const filters = {
  q: "",
  lang: "all",
  channel: "all",
  status: "all",
  group: "all",
};
const selected = new Set();

export async function render(view, params, query, token) {
  if (query.lang) filters.lang = query.lang;
  if (query.status) filters.status = query.status;
  const { conversations } = await api.conversations();
  if (!isViewAlive(token)) return;
  const groups = [...new Set(conversations.map((c) => c.group_id))];

  view.innerHTML = `
    <div class="toolbar">
      <label class="search">${icon("search")}<input class="input" id="q" placeholder="${t("search")}" value="${esc(filters.q)}"></label>
      <div class="seg" data-f="lang">${["all", "RU", "KZ", "EN"].map((v) => `<button data-v="${v}" class="${filters.lang === v ? "on" : ""}">${v === "all" ? t("all") : v}</button>`).join("")}</div>
      <div class="seg" data-f="channel">${[
        ["all", t("all")],
        ["agent chat", t("chat")],
        ["voice call", t("call")],
      ]
        .map(
          ([v, l]) =>
            `<button data-v="${v}" class="${filters.channel === v ? "on" : ""}">${l}</button>`,
        )
        .join("")}</div>
      ${groups.length > 1 ? `<select class="select" data-f="group" style="width:auto"><option value="all">${t("all")}</option>${groups.map((g) => `<option ${filters.group === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select>` : ""}
    </div>
    <div class="toolbar">
      <div class="row" style="gap:6px" data-f="status">
        ${[
          ["all", "st_all"],
          ["done", "st_done"],
          ["new", "st_new"],
          ["gross", "st_gross"],
          ["appeal", "st_appeal"],
        ]
          .map(
            ([v, k]) =>
              `<button class="chip ${filters.status === v ? "on" : ""}" data-v="${v}">${t(k)}</button>`,
          )
          .join("")}
      </div>
      <div class="grow"></div>
      <select class="select" id="cl" style="width:auto;max-width:280px">${checklistOptions()}</select>
      <button class="btn" id="eval-visible">${icon("bolt")} ${t("evaluate_visible")} <span class="mono" id="n-visible"></span></button>
      <button class="btn btn-primary" id="eval-selected" disabled>${icon("check")} ${t("evaluate_selected")} <span class="mono" id="n-sel"></span></button>
    </div>
    <div class="table-wrap">
      <table class="t">
        <thead><tr>
          <th style="width:36px"><input type="checkbox" class="cb" id="all"></th>
          <th>${t("col_dialog")}</th><th>${t("col_lang")}</th><th class="hide-sm">${t("col_channel")}</th>
          <th class="hide-sm">${t("col_msgs")}</th><th>${t("col_score")}</th><th>${t("col_status")}</th><th class="hide-sm">${t("col_checklist")}</th>
        </tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>`;

  const visible = () =>
    conversations.filter((c) => {
      const e = c.evaluation;
      if (filters.lang !== "all" && c.language !== filters.lang) return false;
      if (filters.channel !== "all" && c.channel !== filters.channel)
        return false;
      if (filters.group !== "all" && c.group_id !== filters.group) return false;
      if (filters.status === "done" && !e) return false;
      if (filters.status === "new" && e) return false;
      if (filters.status === "gross" && !e?.gross_error) return false;
      if (filters.status === "appeal" && !e?.open_appeals) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        if (
          !(c.external_id || c.conversation_id).toLowerCase().includes(q) &&
          !c.preview.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });

  const draw = () => {
    const list = visible();
    $("#rows", view).innerHTML = list.length
      ? list.map(row).join("")
      : `<tr><td colspan="8">${emptyState("search", "—", t("search"))}</td></tr>`;
    $("#n-visible", view).textContent = list.length;
    $("#n-sel", view).textContent = selected.size || "";
    $("#eval-selected", view).disabled = !selected.size;
    $("#all", view).checked =
      list.length && list.every((c) => selected.has(c.conversation_id));
  };

  const row = (c) => {
    const e = c.evaluation;
    const total = e ? e.final_total : null;
    return `<tr data-id="${esc(c.conversation_id)}" class="${selected.has(c.conversation_id) ? "sel" : ""}">
      <td><input type="checkbox" class="cb" data-sel ${selected.has(c.conversation_id) ? "checked" : ""}></td>
      <td class="cell-main"><div class="id">${esc(c.external_id || c.conversation_id)}</div><div class="preview">${esc(c.preview)}</div></td>
      <td><span class="badge lang-${c.language}">${c.language}</span></td>
      <td class="hide-sm"><span class="badge">${icon(c.channel === "voice call" ? "phone" : "chat")} ${c.channel === "voice call" ? t("call") : t("chat")}</span></td>
      <td class="hide-sm mono">${c.messages}</td>
      <td>${e ? `<span class="score-pill ${scoreClass(total)}">${fmtScore(total)}</span>${e.total !== e.final_total ? `<div class="strike" style="font-size:11px;margin-top:2px">${fmtScore(e.total)}</div>` : ""}` : `<span class="muted" style="font-size:12px">${t("not_evaluated")}</span>`}</td>
      <td><div class="row" style="gap:5px">
        ${e?.gross_error ? `<span class="badge gross">${icon("alert")} ${t("gross_error")}</span>` : ""}
        ${e?.open_appeals ? `<span class="badge warn">${icon("appeal")} ${e.open_appeals}</span>` : ""}
        ${e && e.na_count ? `<span class="badge">N/A ×${e.na_count}</span>` : ""}
      </div></td>
      <td class="hide-sm muted cell-cl" style="font-size:12px">${e ? `${esc(e.checklist_name)} v${e.checklist_version}<br>${fmtDate(e.created_at)}` : ""}</td>
    </tr>`;
  };

  draw();

  $("#q", view).addEventListener(
    "input",
    debounce((e) => {
      filters.q = e.target.value;
      draw();
    }, 120),
  );
  $$("[data-f]", view).forEach((g) => {
    if (g.tagName === "SELECT")
      return g.addEventListener("change", () => {
        filters[g.dataset.f] = g.value;
        draw();
      });
    g.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      filters[g.dataset.f] = b.dataset.v;
      $$("[data-v]", g).forEach((x) => x.classList.toggle("on", x === b));
      draw();
    });
  });
  $("#rows", view).addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest("[data-sel]")) {
      selected.has(id) ? selected.delete(id) : selected.add(id);
      tr.classList.toggle("sel", selected.has(id));
      draw();
      return;
    }
    location.hash = `#/dialog/${encodeURIComponent(id)}`;
  });
  $("#all", view).addEventListener("change", (e) => {
    visible().forEach((c) =>
      e.target.checked
        ? selected.add(c.conversation_id)
        : selected.delete(c.conversation_id),
    );
    draw();
  });
  const run = async (ids) => {
    if (!ids.length) return;
    await runEvaluation({
      conversation_ids: ids,
      checklist_id: $("#cl", view).value,
      sync: false,
    });
    selected.clear();
    if (isViewAlive(token)) render(view, params, {}, token);
  };
  $("#eval-selected", view).addEventListener("click", () => run([...selected]));
  $("#eval-visible", view).addEventListener("click", () =>
    run(visible().map((c) => c.conversation_id)),
  );
  void state;
}
