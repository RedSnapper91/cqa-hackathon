import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  BackendClient,
  BackendError,
  legacyChecklist,
  backendChecklist,
  legacyRun,
} from "../lib/backend-client.js";
import { createGateway, uploadPayload } from "../server.js";
const seed = {
  ...JSON.parse(
    fs.readFileSync(
      new URL("../config/official_checklist_v1.json", import.meta.url),
      "utf8",
    ),
  ),
  id: "v1",
  version: 1,
};

test("checklist adapter preserves dynamic criteria, exact scales, labels and N/A rules", () => {
  const source = structuredClone(seed);
  source.criteria[0].id = "CUSTOM";
  source.criteria[0].yes_label = "Present";
  source.criteria[0].no_label = "Missing";
  const legacy = legacyChecklist(source);
  const restored = backendChecklist({ ...legacy, base_id: "v1" });
  assert.deepEqual(restored.criteria, source.criteria);
  assert.equal(restored.parent_id, "v1");
  assert.deepEqual(restored.criteria[3].allowed_scores, [0, 5, 10, 15, 20]);
  assert.deepEqual(restored.criteria[5].allowed_scores, [0, 4, 7, 10]);
});
test("report adapter uses the authoritative decimal total and exact evidence mapping", () => {
  const messages = [
    {
      id: "m1",
      ordinal: 0,
      text: "Сәлеметсіз бе!",
      speaker: "operator",
      timestamp: "00:00",
    },
  ];
  const criteria = seed.criteria.map((c) => ({
    criterion_id: c.id,
    status: c.id === "C03" ? "na" : "scored",
    raw_score: c.kind === "flag" || c.id === "C03" ? null : c.max_score,
    answer:
      c.kind === "flag"
        ? c.yes_label
        : c.id === "C03"
          ? "N/A"
          : c.kind === "binary"
            ? c.yes_label
            : String(c.max_score),
    reason: "TEST ONLY",
    evidence_message_ids: ["m1"],
    checked_span: { start_message_id: "m1", end_message_id: "m1" },
    review_required: false,
    weight: String(c.weight),
    contribution: c.kind === "flag" || c.id === "C03" ? null : String(c.weight),
  }));
  const summary = {
    score: "81.88",
    denominator: "80",
    earned: "65.5",
    gross_violation: true,
    criteria,
    sections: {
      Opening: {
        earned: "25",
        denominator: "25",
        score: "100.00",
        flag_only: false,
      },
    },
  };
  const report = legacyRun(
    {
      id: "run1",
      conversation_id: "c",
      status: "completed",
      provider: "test-only",
      original: summary,
      final: summary,
    },
    seed,
    { messages },
  );
  assert.equal(report.final_score.total, 81.88);
  assert.equal(report.final_score.gross_error, true);
  assert.equal(report.engine, "test");
  assert.deepEqual(report.criteria[0].evidence, [0]);
  assert.deepEqual(report.criteria[0].checked_range, [0, 0]);
  assert.equal(report.criteria[2].answer, "na");
});
test("unconfigured backend evaluation stays HTTP 503 without a rule-engine fallback", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ detail: "Model not connected" }), {
      status: 503,
    });
  });
  await assert.rejects(
    new BackendClient().evaluate({
      conversation_ids: ["c1"],
      checklist_id: "v1",
    }),
    (error) => error.status === 503 && error.message === "Model not connected",
  );
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, "/api/evaluations/batch");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    conversation_ids: ["c1"],
    checklist_version_id: "v1",
  });
});
test("gateway serves UI, translates errors, and never serves private root files", async (t) => {
  const server = createGateway({
    backend: {
      health: async () => ({
        ok: true,
        backend_connected: true,
        engine: { mode: "placeholder" },
      }),
      evaluate: async () => {
        throw new BackendError(503, "Model not connected");
      },
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + "/")).status, 200);
  assert.equal(
    (await (await fetch(base + "/api/health")).json()).engine.mode,
    "placeholder",
  );
  const response = await fetch(base + "/api/evaluate", {
    method: "POST",
    body: JSON.stringify({ conversation_ids: ["c1"] }),
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Model not connected" });
  assert.equal((await fetch(base + "/.env")).status, 404);
  assert.equal((await fetch(base + "/..%2f.env")).status, 403);
});
test("upload adapter preserves organizer envelope and normalizes pasted multilingual text", () => {
  const payload = {
    error: "",
    isSuccess: true,
    data: { dataset_group_id: "DEV", total_records: 0, records: [] },
  };
  assert.equal(uploadPayload({ payload }), payload);
  const text = uploadPayload({
    conversation_id: "pasted-kz",
    language: "KZ",
    text: "00:00 client: Сәлеметсіз бе!\n00:02 operator: Сәлеметсіз бе! Мен Алия.",
  });
  assert.equal(text.data.records[0].transcript[1].speaker, "operator");
  assert.equal(
    text.data.records[0].transcript[1].text,
    "Сәлеметсіз бе! Мен Алия.",
  );
  assert.equal(text.data.records[0].audio_url, null);
});
