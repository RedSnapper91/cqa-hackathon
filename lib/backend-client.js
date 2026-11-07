// Compatibility boundary: the existing team UI uses the authoritative FastAPI API.
// No rule-engine fallback, model keys, organizer URL, or second data store lives here.
export class BackendError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const number = (value) => (value == null ? null : Number(value));
const rounded = (value) =>
  value == null ? null : Math.round((value + Number.EPSILON) * 100) / 100;
export function legacyChecklist(version) {
  const sections = [
    ...new Set(version.criteria.filter((c) => c.active).map((c) => c.section)),
  ];
  return {
    id: version.id,
    name: version.name,
    version: version.version,
    family: "backend",
    created_at: version.created_at,
    sections: sections.map((title) => ({ id: title, title })),
    criteria: version.criteria
      .filter((c) => c.active)
      .map((c, i) => ({
        ...c,
        code: String(i + 1).padStart(2, "0"),
        type: c.kind === "discrete_scale" ? "scale" : c.kind,
        allow_na: c.na_allowed,
        scale: c.allowed_scores.map((value) => ({
          value,
          label: c.rubric[String(value)] || "",
        })),
        rule: "configured",
      })),
  };
}
export function backendChecklist(body) {
  const sections = new Map((body.sections || []).map((s) => [s.id, s.title]));
  return {
    name: body.name,
    parent_id: body.base_id || null,
    criteria: (body.criteria || []).map((c) => {
      const scale =
        c.type === "scale"
          ? (c.scale || []).map((s) => Number(s.value))
          : [0, 1];
      return {
        id: c.id,
        section: sections.get(c.section) || c.section || "Основное",
        title: c.title,
        description: c.description,
        kind: c.type === "scale" ? "discrete_scale" : c.type,
        weight: Number(c.weight),
        allowed_scores: scale,
        max_score: Math.max(...scale),
        yes_label: c.yes_label || "Да",
        no_label: c.no_label || "Нет",
        rubric:
          c.type === "scale"
            ? Object.fromEntries(
                (c.scale || []).map((s) => [String(s.value), s.label]),
              )
            : c.rubric || {},
        na_allowed: !!c.allow_na,
        na_rule: c.na_rule || "",
        evidence_required: true,
        is_gross_violation_flag:
          c.type === "flag" && (c.is_gross_violation_flag ?? true),
        active: true,
      };
    }),
  };
}
function answer(j, c) {
  return j.status === "na"
    ? "na"
    : c.kind === "discrete_scale"
      ? j.raw_score
      : j.answer === c.yes_label
        ? "yes"
        : "no";
}
function verdict(j, criteria, messages) {
  const c = criteria.find((c) => c.id === j.criterion_id);
  const index = (id) => messages.find((m) => m.id === id)?.ordinal;
  return {
    criterion_id: j.criterion_id,
    answer: answer(j, c),
    explanation: j.reason,
    na_reason: j.na_reason,
    evidence: j.evidence_message_ids.map(index),
    checked_range: j.checked_span
      ? [
          index(j.checked_span.start_message_id),
          index(j.checked_span.end_message_id),
        ]
      : null,
    confidence: null,
    needs_review: j.review_required,
    fact_verification_needed: j.fact_verification_needed,
  };
}
function score(summary, checklist) {
  const denominator = Number(summary.denominator);
  const criteria = checklist.criteria.filter((c) => c.active);
  return {
    total: number(summary.score),
    gross_error: summary.gross_violation,
    gross_flags: criteria
      .filter(
        (c) =>
          c.is_gross_violation_flag &&
          summary.criteria.some(
            (j) => j.criterion_id === c.id && j.answer === c.yes_label,
          ),
      )
      .map((c) => c.id),
    configured_weight: criteria.reduce((sum, c) => sum + c.weight, 0),
    applicable_weight: denominator,
    na_count: summary.criteria.filter((j) => j.status === "na").length,
    rows: summary.criteria.map((j) => {
      const c = criteria.find((c) => c.id === j.criterion_id);
      return {
        criterion_id: c.id,
        type: c.kind === "discrete_scale" ? "scale" : c.kind,
        answer: answer(j, c),
        applicable: j.status !== "na",
        weight: c.weight,
        points_raw: number(j.contribution),
        points:
          j.contribution == null || !denominator
            ? null
            : rounded((Number(j.contribution) * 100) / denominator),
        effective_weight:
          j.status === "na" || !denominator
            ? 0
            : rounded((c.weight * 100) / denominator),
      };
    }),
    sections: Object.entries(summary.sections).map(([title, section]) => ({
      section_id: title,
      title,
      points: denominator
        ? rounded((Number(section.earned) * 100) / denominator)
        : 0,
      max: denominator
        ? rounded((Number(section.denominator) * 100) / denominator)
        : 0,
      percent: number(section.score),
      has_scored: !section.flag_only,
    })),
  };
}
export function legacyRun(run, checklist, conversation, appeals = []) {
  if (!run.final || run.status !== "completed") return null;
  return {
    id: run.id,
    conversation_id: run.conversation_id,
    checklist_id: checklist.id,
    checklist: legacyChecklist(checklist),
    created_at: run.created_at,
    engine: run.provider === "test-only" ? "test" : "model",
    model: run.model,
    cost_usd: run.usage?.estimated_cost_usd ?? null,
    test_mode: run.provider === "test-only",
    warnings: run.warnings || [],
    score: score(run.original, checklist),
    final_score: score(run.final, checklist),
    criteria: run.original.criteria.map((j) =>
      verdict(j, checklist.criteria, conversation.messages),
    ),
    final_criteria: run.final.criteria.map((j) =>
      verdict(j, checklist.criteria, conversation.messages),
    ),
    appeals,
    changed_by_appeal: appeals.some((a) => a.status === "changed"),
  };
}

export class BackendClient {
  constructor(base = process.env.CQA_BACKEND_URL || "http://127.0.0.1:8000") {
    this.base = new URL(base);
    if (
      !["http:", "https:"].includes(this.base.protocol) ||
      this.base.username ||
      this.base.password ||
      this.base.search ||
      this.base.hash ||
      this.base.pathname !== "/"
    ) {
      throw new Error(
        "CQA_BACKEND_URL must be an HTTP(S) origin without credentials or a path",
      );
    }
  }
  async request(path, method = "GET", body) {
    let response;
    try {
      response = await fetch(new URL(path, this.base), {
        method,
        headers:
          body instanceof FormData
            ? undefined
            : { "content-type": "application/json" },
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
    } catch {
      throw new BackendError(
        502,
        "FastAPI backend is unavailable. Start the backend or check CQA_BACKEND_URL.",
      );
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.detail;
      throw new BackendError(
        response.status,
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((e) => e.message || e.msg).join("; ")
            : "Backend request failed",
      );
    }
    return data;
  }
  async all(path) {
    let items = [],
      page = 1;
    for (;;) {
      const result = await this.request(
        `${path}${path.includes("?") ? "&" : "?"}size=100&page=${page++}`,
      );
      items.push(...result.items);
      if (items.length >= result.total) return items;
    }
  }
  async meta() {
    const [config, versions, selected] = await Promise.all([
      this.request("/api/config/status"),
      this.request("/api/checklists"),
      this.request("/api/preferences/checklist"),
    ]);
    return { config, versions, selected: selected.checklist_version_id };
  }
  async health() {
    const { config, selected } = await this.meta();
    return {
      ok: true,
      backend_connected: true,
      active_checklist_id: selected,
      test_mode: config.test_mode,
      engine: {
        mode: config.test_mode
          ? "test"
          : config.llm_configured
            ? "model"
            : "placeholder",
        label: config.test_mode
          ? "TEST MODE · deterministic fixture"
          : config.llm_configured
            ? config.model
            : "Gemini placeholder · model not connected",
        url_configured: config.llm_configured,
      },
    };
  }
  async checklists() {
    const { versions, selected } = await this.meta();
    return {
      checklists: versions.map(legacyChecklist),
      active_checklist_id: selected,
      rule_types: ["configured"],
    };
  }
  async saveChecklist(body) {
    const version = await this.request(
      "/api/checklists",
      "POST",
      backendChecklist(body),
    );
    if (body.activate)
      await this.request("/api/preferences/checklist", "POST", {
        checklist_version_id: version.id,
      });
    return legacyChecklist(version);
  }
  async list() {
    const [rows, runs, versions, appeals] = await Promise.all([
      this.all("/api/conversations"),
      this.all("/api/evaluations"),
      this.request("/api/checklists"),
      this.request("/api/appeals"),
    ]);
    const byId = new Map(runs.map((r) => [r.id, r]));
    return {
      conversations: rows.map((c) => {
        const r = byId.get(c.latest_evaluation?.id),
          v = versions.find((v) => v.id === r?.checklist_version_id);
        return {
          conversation_id: c.id,
          external_id: c.external_id,
          channel: c.channel,
          language: c.language,
          group_id: c.group_id,
          source: "FastAPI",
          messages: c.message_count,
          operator_messages: c.operator_messages,
          has_audio: !!c.has_audio,
          preview: c.preview || "",
          status: c.status,
          evaluation: r?.final
            ? {
                id: r.id,
                total: number(r.original.score),
                final_total: number(r.final.score),
                gross_error: r.final.gross_violation,
                checklist_name: v.name,
                checklist_version: v.version,
                engine: r.provider === "test-only" ? "test" : "model",
                created_at: r.created_at,
                open_appeals: appeals.filter(
                  (a) => a.run_id === r.id && a.status === "pending",
                ).length,
                na_count: r.final.criteria.filter((j) => j.status === "na")
                  .length,
              }
            : null,
        };
      }),
    };
  }
  async convertAppeal(a, conversation) {
    const c = a.criterion,
      decision = a.decision;
    return {
      id: a.id,
      evaluation_id: a.run_id,
      conversation_id: a.conversation_id,
      external_id: a.external_id,
      language: conversation.language,
      criterion_id: a.criterion_id,
      criterion: legacyChecklist({ id: "context", criteria: [c] }).criteria[0],
      author: a.actor,
      comment: a.comment,
      created_at: a.created_at,
      status:
        a.status === "pending"
          ? "open"
          : a.status === "confirmed"
            ? "upheld"
            : "changed",
      original_answer: answer(a.original_judgment, c),
      requested_answer: null,
      total_before: number(decision?.before_score ?? a.final_score),
      total_after: decision ? number(decision.after_score) : null,
      verdict: verdict(a.original_judgment, [c], conversation.messages),
      evidence: a.original_judgment.evidence_message_ids.map((id) => {
        const m = conversation.messages.find((m) => m.id === id);
        return { ...m, idx: m.ordinal };
      }),
      decision: decision
        ? {
            reason: decision.reason,
            reviewer: decision.reviewer,
            new_answer: answer(decision.after_judgment, c),
            decided_at: decision.created_at,
          }
        : null,
    };
  }
  async conversation(id) {
    const [c, runs, versions, appeals] = await Promise.all([
      this.request(`/api/conversations/${encodeURIComponent(id)}`),
      this.request(`/api/conversations/${encodeURIComponent(id)}/evaluations`),
      this.request("/api/checklists"),
      this.request("/api/appeals"),
    ]);
    const mapped = await Promise.all(
      appeals
        .filter((a) => a.conversation_id === id)
        .map((a) => this.convertAppeal(a, c)),
    );
    return {
      conversation: {
        conversation_id: c.id,
        external_id: c.external_id,
        channel: c.channel,
        language: c.language,
        group_id: c.group_id,
        audio_url: c.audio_url,
        transcript: c.messages.map((m) => ({ ...m, idx: m.ordinal, t: null })),
      },
      evaluations: runs
        .filter((r) => r.status === "completed")
        .map((r) =>
          legacyRun(
            r,
            versions.find((v) => v.id === r.checklist_version_id),
            c,
            mapped.filter((a) => a.evaluation_id === r.id),
          ),
        ),
      pending: runs.filter((r) => ["queued", "processing"].includes(r.status)),
      errors: runs.filter((r) => r.status === "failed").map((r) => r.error),
    };
  }
  async appeals() {
    const rows = await this.request("/api/appeals");
    const conversations = new Map();
    for (const id of new Set(rows.map((a) => a.conversation_id)))
      conversations.set(
        id,
        await this.request("/api/conversations/" + encodeURIComponent(id)),
      );
    return {
      appeals: await Promise.all(
        rows.map((a) =>
          this.convertAppeal(a, conversations.get(a.conversation_id)),
        ),
      ),
    };
  }
  async appeal(rid, body) {
    const result = await this.request("/api/appeals", "POST", {
      run_id: rid,
      criterion_id: body.criterion_id,
      comment: body.comment,
      actor: body.author || "Quality supervisor",
    });
    return {
      appeal: await this.convertAppeal(
        result,
        await this.request("/api/conversations/" + result.conversation_id),
      ),
    };
  }
  async decide(id, body) {
    const a = await this.request("/api/appeals/" + encodeURIComponent(id));
    const c = a.criterion,
      old = a.current_judgment,
      change = body.decision === "changed";
    let judgment;
    if (change) {
      const conversation = await this.request(
          "/api/conversations/" + a.conversation_id,
        ),
        isNA = body.new_answer === "na";
      let raw = c.kind === "flag" || isNA ? null : Number(body.new_answer);
      if (c.kind === "binary" && !isNA) {
        if (!["yes", "no"].includes(body.new_answer))
          throw new BackendError(422, "Invalid binary answer");
        raw = body.new_answer === "yes" ? 1 : 0;
      }
      if (c.kind === "flag" && !["yes", "no"].includes(body.new_answer))
        throw new BackendError(422, "Invalid flag answer");
      const cited = conversation.messages.filter((m) =>
        old.evidence_message_ids.includes(m.id),
      );
      judgment = {
        criterion_id: c.id,
        status: isNA ? "na" : "scored",
        answer: isNA
          ? "N/A"
          : c.kind === "discrete_scale"
            ? String(raw)
            : body.new_answer === "yes"
              ? c.yes_label
              : c.no_label,
        raw_score: raw,
        reason: body.reason,
        na_reason: isNA ? body.reason : null,
        evidence_message_ids: old.evidence_message_ids,
        checked_span: old.checked_span || {
          start_message_id: cited[0].id,
          end_message_id: cited.at(-1).id,
        },
        omission: !isNA && (old.omission || (c.kind === "binary" && raw === 0)),
        quotes: [],
        review_required: old.review_required,
        fact_verification_needed: old.fact_verification_needed,
      };
    }
    if (!["changed", "upheld"].includes(body.decision))
      throw new BackendError(422, "Choose confirm or change");
    const result = await this.request(
      "/api/appeals/" + encodeURIComponent(id) + "/decision",
      "POST",
      {
        action: change ? "change" : "confirm",
        reason: body.reason,
        reviewer: body.reviewer || "Demo reviewer",
        ...(judgment ? { judgment } : {}),
      },
    );
    return {
      appeal: await this.convertAppeal(
        result,
        await this.request("/api/conversations/" + a.conversation_id),
      ),
    };
  }
  async evaluate(body) {
    const version = body.checklist_id || (await this.meta()).selected;
    let ids = body.conversation_ids;
    if (!ids) {
      const rows = await this.all(
        "/api/conversations" +
          (body.group_id && body.group_id !== "*"
            ? "?group_id=" + encodeURIComponent(body.group_id)
            : ""),
      );
      ids = rows.map((c) => c.id);
    }
    const job = await this.request("/api/evaluations/batch", "POST", {
      conversation_ids: ids,
      checklist_version_id: version,
    });
    return this.job(job.id);
  }
  async job(id) {
    const job = await this.request("/api/batches/" + encodeURIComponent(id));
    const result = {
      id: job.id,
      total: job.total,
      done: job.finished,
      failed: job.counts.failed,
      status: job.status === "running" ? "running" : "done",
      errors: job.items
        .filter((i) => i.status === "failed")
        .map((i) => ({ conversation_id: i.conversation_id, error: i.error })),
      evaluation_ids: job.items
        .filter((i) => i.status === "completed")
        .map((i) => i.id),
      evaluations: [],
    };
    if (result.status === "done")
      for (const item of job.items.filter((i) => i.status === "completed")) {
        const [run, conversation] = await Promise.all([
          this.request("/api/evaluations/" + item.id),
          this.request("/api/conversations/" + item.conversation_id),
        ]);
        result.evaluations.push(legacyRun(run, run.checklist, conversation));
      }
    return result;
  }
  async upload(payload) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([JSON.stringify(payload)], { type: "application/json" }),
      "dataset.json",
    );
    const imported = await this.request(
      "/api/datasets/import-json",
      "POST",
      form,
    );
    const rows = await this.all(
      "/api/conversations?group_id=" + encodeURIComponent(imported.group_id),
    );
    const importedIds = new Set(
      payload.data.records.map((r) => r.conversation_id),
    );
    return {
      ...imported,
      ids: rows.filter((c) => importedIds.has(c.external_id)).map((c) => c.id),
    };
  }
  async stats() {
    const [
      dashboard,
      { conversations },
      groups,
      { checklists, active_checklist_id },
      runs,
    ] = await Promise.all([
      this.request("/api/dashboard"),
      this.list(),
      this.request("/api/datasets"),
      this.checklists(),
      this.all("/api/evaluations"),
    ]);
    const scored = conversations.filter((c) => c.evaluation),
      totals = scored
        .map((c) => c.evaluation.final_total)
        .filter((n) => n !== null),
      active = checklists.find((c) => c.id === active_checklist_id);
    const average = (values) =>
      values.length
        ? rounded(values.reduce((a, b) => a + b, 0) / values.length)
        : null;
    const latestRuns = conversations
      .map((c) => runs.find((r) => r.id === c.evaluation?.id))
      .filter(Boolean);
    return {
      conversations: dashboard.imported,
      calls: dashboard.channels["voice call"],
      evaluated: dashboard.evaluated,
      average: average(totals),
      gross_errors: dashboard.flagged,
      appeals_open: dashboard.open_appeals,
      appeals_total: dashboard.appealed,
      histogram: Array.from({ length: 10 }, (_, i) => ({
        from: i * 10,
        to: (i + 1) * 10,
        count: totals.filter(
          (t) => t >= i * 10 && (i === 9 ? t <= 100 : t < (i + 1) * 10),
        ).length,
      })),
      per_criterion: (active?.criteria || []).map((c) => {
        const eligible = latestRuns
            .filter((r) => r.checklist_version_id === active.id)
            .map((r) => r.final.criteria.find((j) => j.criterion_id === c.id))
            .filter(Boolean),
          applicable = eligible.filter((j) => j.status !== "na");
        return {
          criterion_id: c.id,
          code: c.code,
          title: c.title,
          type: c.type,
          rate: average(
            applicable.map((j) =>
              c.type === "flag"
                ? j.answer === c.yes_label
                  ? 100
                  : 0
                : (100 * j.raw_score) / c.max_score,
            ),
          ),
          na: eligible.length - applicable.length,
          evaluated: eligible.length,
        };
      }),
      by_language: ["RU", "KZ", "EN"].map((language) => {
        const rows = conversations.filter((c) => c.language === language),
          evaluated = rows.filter((c) => c.evaluation);
        return {
          language,
          conversations: rows.length,
          evaluated: evaluated.length,
          average: average(
            evaluated
              .map((c) => c.evaluation.final_total)
              .filter((n) => n !== null),
          ),
        };
      }),
      datasets: groups.map((g) => ({
        group_id: g.id,
        count: g.reported_count,
        source: g.source,
        loaded_at: g.imported_at,
      })),
      worst: scored
        .filter((c) => c.evaluation.final_total !== null)
        .sort((a, b) => a.evaluation.final_total - b.evaluation.final_total)
        .slice(0, 5)
        .map((c) => ({
          conversation_id: c.id || c.conversation_id,
          external_id: c.external_id,
          total: c.evaluation.final_total,
          gross: c.evaluation.gross_error,
        })),
      gross_list: scored
        .filter((c) => c.evaluation.gross_error)
        .map((c) => ({
          conversation_id: c.conversation_id,
          external_id: c.external_id,
          total: c.evaluation.final_total,
          gross: true,
        })),
    };
  }
}
