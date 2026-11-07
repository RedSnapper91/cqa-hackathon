import { api } from "../api.js";
import { t } from "../i18n.js";
import { esc, icon, fmtDate, toast, $ } from "../ui.js";
import {
  state,
  refreshMeta,
  runEvaluation,
  isViewAlive,
  activeChecklist,
} from "../state.js";

const CONTRACT = `Browser → Node API gateway → FastAPI → provider adapter

POST /api/evaluations
{ "conversation_id": "<stable internal id>", "checklist_version_id": "v1" }

Gemini is a placeholder until the server-side provider is configured.
Unconfigured evaluation returns 503 with no invented score.
Schemas and provider adapter: backend/app/schemas.py and
backend/app/services/llm_provider.py.

No API keys or signed organizer URLs belong in the browser.`;

export async function render(view, params, query, token) {
  const st = await api.stats();
  if (!isViewAlive(token)) return;
  const engine = state.health?.engine;

  view.innerHTML = `
    <div class="grid-2">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>${icon("db").replace("<svg", '<svg style="width:17px;height:17px;stroke:var(--brand);fill:none;stroke-width:2;vertical-align:-3px"')} ${t("imp_api")}</h3></div>
          <p class="muted" style="margin:0 0 14px">${t("imp_api_text")}</p>
          <div class="row" style="flex-wrap:nowrap">
            <input class="input mono" id="group" value="DEV" placeholder="group_id">
            <button class="btn btn-primary" id="load">${icon("download")} ${t("load")}</button>
          </div>
          <div style="margin-top:18px"><b style="font-size:13px">${t("datasets")}</b>
            <div class="list" style="margin-top:6px">
              ${st.datasets
                .map(
                  (d) => `<div class="list-item">
                <span class="badge ${d.source === "upload" ? "info" : "ok"} mono">${esc(d.group_id)}</span>
                <span class="mono">${d.count}</span><span class="muted" style="font-size:12px">${esc(d.source)} · ${fmtDate(d.loaded_at)}</span>
                <button class="btn btn-sm" style="margin-left:auto" data-evalset="${esc(d.group_id)}">${icon("bolt")} ${t("evaluate_set")}</button>
              </div>`,
                )
                .join("")}
            </div></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>${t("imp_file")}</h3></div>
          <p class="muted" style="margin:0 0 14px">${t("imp_file_text")}</p>
          <label class="drop" id="drop">${icon("file").replace("<svg", '<svg style="width:28px;height:28px;stroke:currentColor;fill:none;stroke-width:1.6;display:block;margin:0 auto 8px"')}${t("drop")}<input type="file" id="file" accept=".json,application/json" hidden></label>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>${t("imp_text")}</h3></div>
          <p class="muted" style="margin:0 0 14px">${t("imp_text_text")}</p>
          <div class="row" style="margin-bottom:10px">
            <label class="field grow"><span>${t("conv_id")}</span><input class="input mono" id="cid" placeholder="upload-001"></label>
            <label class="field"><span>${t("language")}</span><select class="select" id="clang"><option>RU</option><option>KZ</option><option>EN</option></select></label>
            <label class="field"><span>${t("channel")}</span><select class="select" id="cch"><option value="agent chat">${t("chat")}</option><option value="voice call">${t("call")}</option></select></label>
          </div>
          <textarea class="textarea mono" id="ctext" rows="9" style="font-size:12.5px" placeholder="00:00 client: Где посмотреть мой тариф?
00:38 system: Эскалация на оператора.
01:15 operator: Здравствуйте! Меня зовут Алина. Откройте «Кабинет».
01:28 client: Нашла, спасибо.
02:04 operator: Пожалуйста. Хорошего вечера!"></textarea>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn btn-primary" id="paste">${icon("check")} ${t("upload_open")}</button></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>${icon("cpu").replace("<svg", '<svg style="width:17px;height:17px;stroke:var(--warn);fill:none;stroke-width:2;vertical-align:-3px"')} ${t("imp_model")}</h3>
            <span class="badge ${engine?.mode === "model" ? "ok" : "warn"}">${engine?.mode === "model" ? esc(engine.label) : t("engine_stub")}</span></div>
          <p class="muted" style="margin:0 0 12px">${t("imp_model_text")}</p>
          <pre class="code">${esc(CONTRACT)}</pre>
        </div>
      </div>
    </div>`;

  $("#load", view).onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span> ${t("load")}`;
    try {
      const r = await api.loadGroup($("#group", view).value.trim());
      toast(`${t("loaded")}: ${r.group_id} — ${r.total} (+${r.added})`);
      await refreshMeta();
      render(view, params, query, token);
    } catch (err) {
      toast(err.message, "err");
      btn.disabled = false;
      btn.innerHTML = `${icon("download")} ${t("load")}`;
    }
  };
  view.onclick = async (e) => {
    const b = e.target.closest("[data-evalset]");
    if (!b) return;
    await runEvaluation({
      group_id: b.dataset.evalset,
      checklist_id: activeChecklist()?.id,
    });
    location.hash = "#/dialogs";
  };

  const drop = $("#drop", view);
  const handleFile = async (file) => {
    try {
      const payload = JSON.parse(await file.text());
      const r = await api.upload({ payload, group_id: "UPLOAD" });
      toast(`${t("loaded")}: ${r.ids.length}`);
      await refreshMeta();
      location.hash =
        r.ids.length === 1
          ? `#/dialog/${encodeURIComponent(r.ids[0])}`
          : "#/dialogs";
    } catch (err) {
      toast(err.message, "err");
    }
  };
  $("#file", view).onchange = (e) =>
    e.target.files[0] && handleFile(e.target.files[0]);
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]);
  });

  $("#paste", view).onclick = async () => {
    try {
      const r = await api.upload({
        text: $("#ctext", view).value,
        conversation_id: $("#cid", view).value.trim() || undefined,
        language: $("#clang", view).value,
        channel: $("#cch", view).value,
        group_id: "UPLOAD",
      });
      await refreshMeta();
      location.hash = `#/dialog/${encodeURIComponent(r.ids[0])}`;
    } catch (err) {
      toast(err.message, "err");
    }
  };
}
