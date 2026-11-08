// Safe first HTTP integration check. Never sends a conversation to a paid model.
import assert from "node:assert/strict";
const args = process.argv.slice(2),
  get = (name, fallback) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
  };
const base = new URL(get("--base", "http://127.0.0.1:3210"));
assert.ok(
  ["http:", "https:"].includes(base.protocol) &&
    !base.username &&
    !base.password,
  "Use an HTTP(S) origin without credentials",
);
async function call(path, body) {
  const response = await fetch(new URL(path, base), {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  return { status: response.status, data: await response.json() };
}
const health = await call("/api/health");
assert.equal(health.status, 200);
assert.equal(health.data.backend_connected, true);
const config = (await call("/api/config/status")).data;
const demo = args.includes("--demo") || !config.organizer_configured;
const group = demo ? "SYNTHETIC_DEMO" : get("--group", "DEV");
const imported = await call(
  demo ? "/api/datasets/demo" : "/api/datasets/load",
  demo ? {} : { group_id: group },
);
assert.equal(imported.status, 200, "Dataset import must succeed");
const [{ data: list }, { data: versions }, { data: stats }] = await Promise.all(
  [call("/api/conversations"), call("/api/checklists"), call("/api/stats")],
);
const rows = list.conversations.filter((c) => c.group_id === group);
assert.ok(
  rows.length > 0,
  "Imported conversations must be visible through the frontend API",
);
const sample = rows.find((c) => c.language === "KZ") || rows[0];
const detail = await call("/api/conversations/" + sample.conversation_id);
assert.equal(detail.status, 200);
assert.ok(detail.data.conversation.transcript.length > 0);
assert.ok(
  detail.data.conversation.transcript.every(
    (m) =>
      m.timestamp &&
      ["client", "operator", "bot", "system"].includes(m.speaker),
  ),
);
assert.ok(versions.checklists.length > 0);
assert.ok(stats.conversations >= rows.length);
let evaluation = "not run: configured provider intentionally left untouched";
if (!config.llm_configured) {
  const before = (await call("/api/evaluations?size=1")).data.total;
  const response = await call("/api/evaluate", {
    conversation_ids: [sample.conversation_id],
    checklist_id: versions.active_checklist_id,
  });
  assert.equal(response.status, 503);
  assert.ok(response.data.error);
  assert.equal((await call("/api/evaluations?size=1")).data.total, before);
  evaluation = "HTTP 503 expected; no invented evaluation or score";
}
const counts = (key) =>
  Object.fromEntries(
    [...new Set(rows.map((c) => c[key]))].map((value) => [
      value,
      rows.filter((c) => c[key] === value).length,
    ]),
  );
console.log(
  JSON.stringify(
    {
      status: "PASS",
      frontend_api: base.origin,
      backend_connected: true,
      group,
      source: demo ? "synthetic demo" : "organizer API",
      conversations: rows.length,
      languages: counts("language"),
      channels: counts("channel"),
      model_mode: health.data.engine.mode,
      evaluation,
      paid_model_calls: 0,
    },
    null,
    2,
  ),
);
