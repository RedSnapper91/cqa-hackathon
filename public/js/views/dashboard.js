import { api } from "../api.js";
import { t } from "../i18n.js";
import {
  esc,
  icon,
  ring,
  animate,
  scoreClass,
  fmtScore,
  emptyState,
} from "../ui.js";
import { runEvaluation, activeChecklist, isViewAlive } from "../state.js";

export async function render(view, params, query, token) {
  const s = await api.stats();
  if (!isViewAlive(token)) return;
  const cl = activeChecklist();
  const maxHist = Math.max(1, ...s.histogram.map((h) => h.count));
  const evaluated = s.evaluated > 0;

  view.innerHTML = `
    <section class="hero">
      <div style="position:relative;z-index:1">
        <span class="eyebrow">${t("hero_eyebrow")}</span>
        <h2>${t("hero_title")}</h2>
        <p>${t("hero_text")}</p>
        <div class="row">
          <button class="btn btn-primary" id="run-all">${icon("bolt")} ${t("evaluate_all")}</button>
          <a class="btn" href="#/dialogs">${icon("dialogs")} ${t("open_dialogs")}</a>
          <span class="muted" style="font-size:12.5px">${t("active_checklist")}: <b style="color:var(--text)">${esc(cl?.name)} · v${cl?.version}</b></span>
        </div>
      </div>
      <div class="hero-ring">${ring(s.average, { size: 190, stroke: 14, label: t("avg_score") })}</div>
    </section>

    <section class="kpis">
      ${kpi("users", t("kpi_dialogs"), s.conversations, `${s.calls} ${t("kpi_calls")} · ${s.by_language.map((l) => l.language).join(" / ")}`)}
      ${kpi("check", t("kpi_evaluated"), s.evaluated, `${t("kpi_of")} ${s.conversations}`, "accent")}
      ${kpi("target", t("kpi_avg"), s.average, t("kpi_after_appeals"))}
      ${kpi("alert", t("kpi_gross"), s.gross_errors, t("kpi_gross_sub"), s.gross_errors ? "danger" : "")}
      ${kpi("appeal", t("kpi_appeals"), s.appeals_total, `${s.appeals_open} ${t("kpi_open")}`, s.appeals_open ? "warn" : "")}
    </section>

    ${
      evaluated
        ? `
    <section class="grid-2">
      <div class="card">
        <div class="card-head"><h3>${t("hist_title")}</h3><span class="muted">${t("hist_sub")}</span></div>
        <div class="hist">
          ${s.histogram
            .map(
              (h) => `
            <div class="col">
              <div class="bar ${h.from < 65 ? "lo" : h.from < 85 ? "mid" : ""}" style="height:${(h.count / maxHist) * 100}%">${h.count ? `<b>${h.count}</b>` : ""}</div>
              <span class="tick">${h.from}</span>
            </div>`,
            )
            .join("")}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>${t("crit_title")}</h3><span class="muted">${t("crit_sub")}</span></div>
        <div class="hbars">
          ${s.per_criterion
            .map(
              (c, i) => `
            <div class="hbar" title="${esc(c.title)} · N/A: ${c.na}">
              <span class="code">${esc(c.code)}</span>
              <div><div class="name">${esc(c.title)}</div><div class="track"><div class="fill ${c.type === "flag" ? "danger" : ""}" style="width:${c.rate ?? 0}%;animation-delay:${i * 60}ms"></div></div></div>
              <span class="val" style="color:${c.type === "flag" ? "var(--no)" : "inherit"}">${c.rate === null ? "—" : c.rate.toFixed(0) + "%"}</span>
            </div>`,
            )
            .join("")}
        </div>
      </div>
    </section>

    <section class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h3>${t("lang_title")}</h3></div>
        <div class="lang-tiles">
          ${s.by_language
            .map(
              (l) => `
            <a class="lang-tile" href="#/dialogs?lang=${l.language}">
              <span class="badge lang-${l.language}">${l.language}</span>
              <div class="big" style="color:${l.average === null ? "var(--muted)" : ""}">${fmtScore(l.average)}</div>
              <div class="muted" style="font-size:12px">${l.evaluated}/${l.conversations} ${t("kpi_evaluated").toLowerCase()}</div>
            </a>`,
            )
            .join("")}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>${t("risk_title")}</h3><span class="muted">${t("risk_sub")}</span></div>
        <div class="list">
          ${[
            ...new Map(
              [...s.worst, ...s.gross_list].map((w) => [w.conversation_id, w]),
            ).values(),
          ]
            .sort((a, b) => b.gross - a.gross || a.total - b.total)
            .slice(0, 8)
            .map(
              (
                w,
              ) => `<a class="list-item" href="#/dialog/${encodeURIComponent(w.conversation_id)}">
              <span class="mono" style="font-weight:700">${esc(w.external_id || w.conversation_id)}</span>
              ${w.gross ? `<span class="badge gross">${icon("alert")} ${t("gross_error")}</span>` : ""}
              <span style="margin-left:auto" class="score-pill ${scoreClass(w.total)}">${fmtScore(w.total)}</span>
            </a>`,
            )
            .join("")}
        </div>
      </div>
    </section>`
        : `<div class="card">${emptyState("bolt", t("nothing_yet"), t("nothing_yet_text"), `<button class="btn btn-primary" id="run-all-2">${icon("bolt")} ${t("evaluate_all")}</button>`)}</div>`
    }
  `;
  animate(view);

  const runAll = async () => {
    await runEvaluation({ group_id: "*", checklist_id: activeChecklist()?.id });
    if (isViewAlive(token)) render(view, params, query, token);
  };
  view.querySelector("#run-all")?.addEventListener("click", runAll);
  view.querySelector("#run-all-2")?.addEventListener("click", runAll);
}

function kpi(ic, label, value, sub, cls = "") {
  return `<div class="kpi ${cls}">
    <div class="k-label">${icon(ic)} ${esc(label)}</div>
    <div class="k-val" data-count="${value ?? ""}">${value === null || value === undefined ? "—" : 0}</div>
    <div class="k-sub">${esc(sub)}</div>
  </div>`;
}
