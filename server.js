// CQA — Conversation Quality Analytics. Zero-dependency Node server (Node 18+).
//   node server.js        → http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './lib/store.js';
import { fetchGroup, normalizeRecord, parseTextTranscript, resolveAudio } from './lib/dataset.js';
import { evaluate, engineInfo } from './lib/model-adapter.js';
import { computeScore, finalAnswers, normalizeAnswer, round2 } from './lib/scoring.js';
import { RULE_TYPES } from './lib/rules-engine.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const portArg = process.argv.indexOf('--port');
const PORT = Number((portArg > -1 && process.argv[portArg + 1]) || process.env.PORT || 3210);
store.load();

// Seed DEV on first start: local snapshot (offline demo) or the organizers' API.
// The snapshot is git-ignored because its audio links are signed.
(async function seed() {
  const db = store.get();
  if (Object.keys(db.conversations).length) return;
  const snap = path.join(store.dataDir(), 'dataset-DEV.json');
  let records;
  let source = 'snapshot';
  try {
    if (fs.existsSync(snap)) {
      records = JSON.parse(fs.readFileSync(snap, 'utf8')).data.records;
    } else {
      records = (await fetchGroup('DEV')).records;
      source = 'api';
      fs.writeFileSync(snap, JSON.stringify({ isSuccess: true, data: { dataset_group_id: 'DEV', records } }));
    }
  } catch (e) {
    console.warn(`DEV не загружен автоматически: ${e.message}. Загрузите набор на странице «Импорт».`);
    return;
  }
  for (const r of records) {
    const c = normalizeRecord(r, 'DEV');
    db.conversations[c.conversation_id] = c;
  }
  db.datasets.DEV = { group_id: 'DEV', count: records.length, loaded_at: store.now(), source };
  store.saveNow();
})();

// ---------------------------------------------------------------- helpers
const json = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};
const fail = (res, code, message) => json(res, code, { error: message });

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const ch of req) {
    size += ch.length;
    if (size > 25 * 1024 * 1024) throw new Error('Слишком большой запрос');
    chunks.push(ch);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const db = () => store.get();
const checklistById = (id) => db().checklists.find((c) => c.id === id);
const activeChecklist = () => checklistById(db().active_checklist_id) || db().checklists[db().checklists.length - 1];

function appealsFor(evaluationId) {
  return db().appeals.filter((a) => a.evaluation_id === evaluationId);
}

/** Evaluation + original and final (after appeals) scores. */
function hydrate(ev) {
  const appeals = appealsFor(ev.id);
  const original = {};
  for (const c of ev.criteria) original[c.criterion_id] = c.answer;
  const originalScore = computeScore(ev.checklist, original);
  const finalScore = computeScore(ev.checklist, finalAnswers(ev, appeals));
  return { ...ev, appeals, score: originalScore, final_score: finalScore, changed_by_appeal: appeals.some((a) => a.status === 'changed') };
}

function latestEvaluation(conversationId) {
  let best = null;
  for (const e of db().evaluations) {
    if (e.conversation_id === conversationId && (!best || e.created_at > best.created_at)) best = e;
  }
  return best;
}

function conversationSummary(c) {
  const ev = latestEvaluation(c.conversation_id);
  const h = ev ? hydrate(ev) : null;
  const first = c.transcript.find((l) => l.speaker === 'client');
  return {
    conversation_id: c.conversation_id,
    channel: c.channel,
    language: c.language,
    group_id: c.group_id,
    source: c.source,
    messages: c.transcript.length,
    operator_messages: c.transcript.filter((l) => l.speaker === 'operator').length,
    has_audio: !!c.audio_url,
    preview: first ? first.text.slice(0, 140) : '',
    evaluation: h && {
      id: h.id,
      total: h.score.total,
      final_total: h.final_score.total,
      gross_error: h.final_score.gross_error,
      checklist_name: h.checklist.name,
      checklist_version: h.checklist.version,
      engine: h.engine,
      created_at: h.created_at,
      open_appeals: h.appeals.filter((a) => a.status === 'open').length,
      na_count: h.final_score.na_count,
    },
  };
}

// ---------------------------------------------------------------- checklist validation
function validateChecklist(body) {
  const errors = [];
  const sections = Array.isArray(body.sections) ? body.sections : [];
  const criteria = Array.isArray(body.criteria) ? body.criteria : [];
  if (!String(body.name || '').trim()) errors.push('Укажите название чек-листа');
  if (!criteria.length) errors.push('Добавьте хотя бы один критерий');
  const ids = new Set();
  const clean = criteria.map((c, i) => {
    const id = String(c.id || `c${String(i + 1).padStart(2, '0')}_${Math.random().toString(36).slice(2, 6)}`);
    if (ids.has(id)) errors.push(`Повторяется id критерия ${id}`);
    ids.add(id);
    const type = ['binary', 'scale', 'flag'].includes(c.type) ? c.type : 'binary';
    const weight = type === 'flag' ? 0 : Number(c.weight);
    if (!String(c.title || '').trim()) errors.push(`Критерий ${i + 1}: нет названия`);
    if (type !== 'flag' && (!Number.isFinite(weight) || weight < 0)) errors.push(`Критерий «${c.title}»: вес должен быть числом ≥ 0`);
    let scale;
    if (type === 'scale') {
      scale = (c.scale || [])
        .map((s) => ({ value: Number(s.value), label: String(s.label || '') }))
        .filter((s) => Number.isFinite(s.value))
        .sort((a, b) => b.value - a.value);
      if (scale.length < 2) errors.push(`Критерий «${c.title}»: у шкалы должно быть минимум 2 ступени`);
      if (scale.length && Math.max(...scale.map((s) => s.value)) <= 0) errors.push(`Критерий «${c.title}»: верхняя ступень шкалы должна быть > 0`);
    }
    return {
      id,
      code: String(c.code || String(i + 1).padStart(2, '0')),
      section: sections.some((s) => s.id === c.section) ? c.section : sections[0]?.id || null,
      type,
      weight,
      allow_na: type === 'flag' ? false : !!c.allow_na,
      title: String(c.title || '').trim(),
      description: String(c.description || ''),
      na_rule: String(c.na_rule || ''),
      scale,
      rule: RULE_TYPES.includes(c.rule) ? c.rule : 'keywords',
      keywords: String(c.keywords || ''),
    };
  });
  return {
    errors,
    value: {
      name: String(body.name || '').trim(),
      note: String(body.note || ''),
      sections: sections.map((s) => ({ id: String(s.id), title: String(s.title || '') })),
      criteria: clean,
    },
  };
}

// ---------------------------------------------------------------- evaluation jobs
const jobs = new Map();

async function runEvaluation(conversationId, checklist, opts) {
  const conv = db().conversations[conversationId];
  if (!conv) throw new Error(`Диалог ${conversationId} не найден`);
  const r = await evaluate(conv, checklist, opts);
  const ev = {
    id: store.uid('ev'),
    conversation_id: conversationId,
    checklist_id: checklist.id,
    checklist: {
      id: checklist.id, name: checklist.name, version: checklist.version, family: checklist.family,
      sections: checklist.sections, criteria: checklist.criteria,
    },
    engine: r.engine,
    model: r.model,
    fallback_reason: r.fallback_reason || null,
    cost_usd: r.cost_usd ?? null,
    created_at: store.now(),
    criteria: r.criteria,
  };
  db().evaluations.push(ev);
  store.save();
  return ev;
}

function startJob(ids, checklist, opts) {
  const job = { id: store.uid('job'), total: ids.length, done: 0, failed: 0, errors: [], evaluation_ids: [], status: 'running', started_at: store.now(), checklist_id: checklist.id };
  jobs.set(job.id, job);
  const queue = [...ids];
  const concurrency = Number(process.env.CQA_CONCURRENCY || (process.env.CQA_MODEL_URL ? 4 : 8));
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      try {
        const ev = await runEvaluation(id, checklist, opts);
        job.evaluation_ids.push(ev.id);
      } catch (e) {
        job.failed++;
        job.errors.push({ conversation_id: id, error: String(e.message || e) });
      }
      job.done++;
    }
  };
  Promise.all(Array.from({ length: Math.min(concurrency, ids.length || 1) }, worker)).then(() => {
    job.status = 'done';
    job.finished_at = store.now();
    store.saveNow();
  });
  return job;
}

// ---------------------------------------------------------------- stats
function stats() {
  const convs = Object.values(db().conversations);
  const latest = convs.map((c) => latestEvaluation(c.conversation_id)).filter(Boolean).map(hydrate);
  const totals = latest.map((e) => e.final_score.total).filter((t) => t !== null);
  const hist = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, count: 0 }));
  totals.forEach((t) => hist[Math.min(9, Math.floor(t / 10))].count++);
  const active = activeChecklist();
  const perCriterion = active.criteria.map((crit) => {
    const vals = latest
      .filter((e) => e.checklist.criteria.some((c) => c.id === crit.id))
      .map((e) => finalAnswers(e, e.appeals)[crit.id]);
    const applicable = vals.filter((v) => v !== 'na' && v !== null && v !== undefined);
    let rate = null;
    if (crit.type === 'flag') rate = vals.length ? vals.filter((v) => v === 'yes').length / vals.length : null;
    else if (crit.type === 'binary') rate = applicable.length ? applicable.filter((v) => v === 'yes').length / applicable.length : null;
    else if (crit.type === 'scale') {
      const max = Math.max(...crit.scale.map((s) => s.value));
      rate = applicable.length ? applicable.reduce((s, v) => s + Number(v) / max, 0) / applicable.length : null;
    }
    return { criterion_id: crit.id, code: crit.code, title: crit.title, type: crit.type, rate: rate === null ? null : round2(rate * 100), na: vals.filter((v) => v === 'na').length, evaluated: vals.length };
  });
  const byLang = {};
  for (const c of convs) {
    const k = c.language;
    byLang[k] ||= { language: k, conversations: 0, evaluated: 0, sum: 0 };
    byLang[k].conversations++;
    const e = latest.find((x) => x.conversation_id === c.conversation_id);
    if (e && e.final_score.total !== null) { byLang[k].evaluated++; byLang[k].sum += e.final_score.total; }
  }
  return {
    conversations: convs.length,
    calls: convs.filter((c) => c.channel === 'voice call').length,
    evaluated: latest.length,
    average: totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
    gross_errors: latest.filter((e) => e.final_score.gross_error).length,
    appeals_open: db().appeals.filter((a) => a.status === 'open').length,
    appeals_total: db().appeals.length,
    histogram: hist,
    per_criterion: perCriterion,
    by_language: Object.values(byLang).map((l) => ({ ...l, average: l.evaluated ? round2(l.sum / l.evaluated) : null })),
    datasets: Object.values(db().datasets),
    worst: latest
      .filter((e) => e.final_score.total !== null)
      .sort((a, b) => a.final_score.total - b.final_score.total)
      .slice(0, 5)
      .map((e) => ({ conversation_id: e.conversation_id, total: e.final_score.total, gross: e.final_score.gross_error })),
    gross_list: latest.filter((e) => e.final_score.gross_error).map((e) => ({ conversation_id: e.conversation_id, total: e.final_score.total, gross: true })),
  };
}

// ---------------------------------------------------------------- routes
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
};

route('GET', '/api/health', (req, res) => json(res, 200, { ok: true, engine: engineInfo(), active_checklist_id: db().active_checklist_id }));
route('GET', '/api/stats', (req, res) => json(res, 200, stats()));

// checklists
route('GET', '/api/checklists', (req, res) =>
  json(res, 200, { active_checklist_id: db().active_checklist_id, checklists: [...db().checklists].reverse(), rule_types: RULE_TYPES }));
route('GET', '/api/checklists/:id', (req, res, p) => {
  const c = checklistById(p.id);
  return c ? json(res, 200, c) : fail(res, 404, 'Чек-лист не найден');
});
route('POST', '/api/checklists', async (req, res) => {
  const body = await readBody(req);
  const { errors, value } = validateChecklist(body);
  if (errors.length) return json(res, 400, { error: errors[0], errors });
  const base = body.base_id ? checklistById(body.base_id) : null;
  const family = base?.family || store.uid('fam');
  const version = Math.max(0, ...db().checklists.filter((c) => c.family === family).map((c) => c.version)) + 1;
  const cl = { ...value, id: store.uid('cl'), family, version, created_at: store.now(), based_on: base?.id || null };
  db().checklists.push(cl);
  if (body.activate !== false) db().active_checklist_id = cl.id;
  store.saveNow();
  json(res, 201, cl);
});
route('POST', '/api/checklists/:id/activate', (req, res, p) => {
  if (!checklistById(p.id)) return fail(res, 404, 'Чек-лист не найден');
  db().active_checklist_id = p.id;
  store.saveNow();
  json(res, 200, { active_checklist_id: p.id });
});

// conversations
route('GET', '/api/conversations', (req, res) => {
  const list = Object.values(db().conversations).map(conversationSummary);
  json(res, 200, { conversations: list });
});
route('GET', '/api/conversations/:id', (req, res, p) => {
  const c = db().conversations[decodeURIComponent(p.id)];
  if (!c) return fail(res, 404, 'Диалог не найден');
  const evs = db().evaluations.filter((e) => e.conversation_id === c.conversation_id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  json(res, 200, { conversation: c, evaluations: evs.map(hydrate) });
});
route('POST', '/api/datasets/load', async (req, res) => {
  const body = await readBody(req);
  const group = String(body.group_id || '').trim();
  if (!group) return fail(res, 400, 'Укажите group_id');
  const { group_id, records } = await fetchGroup(group);
  let added = 0;
  let updated = 0;
  for (const r of records) {
    const c = normalizeRecord(r, group_id);
    if (db().conversations[c.conversation_id]) updated++; else added++;
    db().conversations[c.conversation_id] = c;
  }
  db().datasets[group_id] = { group_id, count: records.length, loaded_at: store.now(), source: 'api' };
  store.saveNow();
  json(res, 200, { group_id, total: records.length, added, updated, ids: records.map((r) => r.conversation_id) });
});
route('POST', '/api/conversations/upload', async (req, res) => {
  const body = await readBody(req);
  let records = [];
  if (body.text) {
    records = [{
      conversation_id: body.conversation_id || `upload-${Date.now().toString(36)}`,
      channel: body.channel || 'agent chat',
      language: body.language,
      transcript: parseTextTranscript(body.text),
      audio_url: body.audio_url || null,
    }];
  }
  const p = body.payload ?? body;
  if (!body.text) {
    if (p && p.isSuccess === false) return fail(res, 400, `Файл содержит ответ API с ошибкой: ${p.error || 'isSuccess = false'}`);
    records = p?.data?.records || p?.records || (Array.isArray(p) ? p : [p]);
  }
  const group = String(body.group_id || p?.data?.dataset_group_id || 'UPLOAD');
  const ids = [];
  for (const r of records) {
    const c = normalizeRecord(r, group, 'upload');
    if (!c.transcript.length) return fail(res, 400, `${c.conversation_id}: пустой транскрипт`);
    db().conversations[c.conversation_id] = c;
    ids.push(c.conversation_id);
  }
  db().datasets[group] = { group_id: group, count: Object.values(db().conversations).filter((c) => c.group_id === group).length, loaded_at: store.now(), source: 'upload' };
  store.saveNow();
  json(res, 201, { ids, group_id: group });
});
route('GET', '/api/audio/:id', async (req, res, p) => {
  const c = db().conversations[decodeURIComponent(p.id)];
  if (!c?.audio_url) return fail(res, 404, 'У диалога нет записи');
  try {
    json(res, 200, { src: await resolveAudio(c.audio_url), player_url: c.audio_url });
  } catch (e) {
    json(res, 200, { src: null, player_url: c.audio_url, error: String(e.message || e) });
  }
});

// evaluation
route('POST', '/api/evaluate', async (req, res) => {
  const body = await readBody(req);
  const checklist = body.checklist_id ? checklistById(body.checklist_id) : activeChecklist();
  if (!checklist) return fail(res, 400, 'Чек-лист не найден');
  let ids = body.conversation_ids;
  if (body.group_id) ids = Object.values(db().conversations).filter((c) => body.group_id === '*' || c.group_id === body.group_id).map((c) => c.conversation_id);
  if (!Array.isArray(ids) || !ids.length) return fail(res, 400, 'Не выбраны диалоги');
  if (ids.length === 1 && body.sync !== false) {
    const ev = await runEvaluation(ids[0], checklist, { outputLanguage: body.output_language || 'ru' });
    store.saveNow();
    return json(res, 200, { evaluation: hydrate(ev) });
  }
  json(res, 202, startJob(ids, checklist, { outputLanguage: body.output_language || 'ru' }));
});
route('GET', '/api/jobs/:id', (req, res, p) => {
  const j = jobs.get(p.id);
  return j ? json(res, 200, j) : fail(res, 404, 'Задача не найдена');
});
route('GET', '/api/evaluations/:id', (req, res, p) => {
  const e = db().evaluations.find((x) => x.id === p.id);
  return e ? json(res, 200, hydrate(e)) : fail(res, 404, 'Оценка не найдена');
});

// appeals
route('GET', '/api/appeals', (req, res) => {
  const list = [...db().appeals].reverse().map((a) => {
    const ev = db().evaluations.find((e) => e.id === a.evaluation_id);
    const h = ev ? hydrate(ev) : null;
    const crit = ev?.checklist.criteria.find((c) => c.id === a.criterion_id);
    const verdict = ev?.criteria.find((c) => c.criterion_id === a.criterion_id);
    const conv = ev ? db().conversations[ev.conversation_id] : null;
    const evidence = (verdict?.evidence || []).map((i) => conv?.transcript[i]).filter(Boolean);
    return { ...a, criterion: crit, verdict, evidence, conversation_id: ev?.conversation_id, language: conv?.language, total: h?.score.total, final_total: h?.final_score.total };
  });
  json(res, 200, { appeals: list });
});
route('POST', '/api/evaluations/:id/appeals', async (req, res, p) => {
  const ev = db().evaluations.find((x) => x.id === p.id);
  if (!ev) return fail(res, 404, 'Оценка не найдена');
  const body = await readBody(req);
  const crit = ev.checklist.criteria.find((c) => c.id === body.criterion_id);
  if (!crit) return fail(res, 400, 'Выберите критерий');
  if (!String(body.comment || '').trim()) return fail(res, 400, 'Добавьте комментарий к апелляции');
  if (appealsFor(ev.id).some((a) => a.criterion_id === crit.id && a.status === 'open')) return fail(res, 409, 'По этому критерию уже есть открытая апелляция');
  const verdict = ev.criteria.find((c) => c.criterion_id === crit.id);
  const before = computeScore(ev.checklist, finalAnswers(ev, appealsFor(ev.id))).total;
  const appeal = {
    id: store.uid('ap'),
    evaluation_id: ev.id,
    criterion_id: crit.id,
    comment: String(body.comment).trim(),
    requested_answer: body.requested_answer != null ? normalizeAnswer(crit, body.requested_answer) : null,
    author: String(body.author || 'Оператор / супервайзер'),
    original_answer: verdict?.answer ?? null,
    total_before: before,
    status: 'open',
    created_at: store.now(),
  };
  db().appeals.push(appeal);
  store.saveNow();
  json(res, 201, appeal);
});
route('POST', '/api/appeals/:id/decision', async (req, res, p) => {
  const a = db().appeals.find((x) => x.id === p.id);
  if (!a) return fail(res, 404, 'Апелляция не найдена');
  if (a.status !== 'open') return fail(res, 409, 'Решение по апелляции уже принято');
  const body = await readBody(req);
  const ev = db().evaluations.find((e) => e.id === a.evaluation_id);
  const crit = ev.checklist.criteria.find((c) => c.id === a.criterion_id);
  const reason = String(body.reason || '').trim();
  if (!reason) return fail(res, 400, 'Укажите причину решения');
  if (body.decision === 'upheld') {
    a.status = 'upheld';
    a.decision = { new_answer: a.original_answer, reason, reviewer: String(body.reviewer || 'Проверяющий'), decided_at: store.now() };
  } else if (body.decision === 'changed') {
    const na = normalizeAnswer(crit, body.new_answer);
    if (na === null) return fail(res, 400, 'Недопустимое значение для этого критерия');
    if (na === a.original_answer) return fail(res, 400, 'Новое значение совпадает с исходным — выберите «Подтвердить»');
    a.status = 'changed';
    a.decision = { new_answer: na, reason, reviewer: String(body.reviewer || 'Проверяющий'), decided_at: store.now() };
  } else return fail(res, 400, 'decision: upheld | changed');
  a.total_after = computeScore(ev.checklist, finalAnswers(ev, appealsFor(ev.id))).total;
  store.saveNow();
  json(res, 200, { appeal: a, evaluation: hydrate(ev) });
});

// export
route('GET', '/api/export.csv', (req, res) => {
  const cl = activeChecklist();
  const head = ['conversation_id', 'language', 'channel', 'checklist', 'total_original', 'total_final', 'gross_error', ...cl.criteria.map((c) => `${c.code} ${c.title}`)];
  const rows = [head];
  for (const c of Object.values(db().conversations)) {
    const e = latestEvaluation(c.conversation_id);
    if (!e) continue;
    const h = hydrate(e);
    const fa = finalAnswers(e, h.appeals);
    rows.push([c.conversation_id, c.language, c.channel, `${e.checklist.name} v${e.checklist.version}`, h.score.total ?? '', h.final_score.total ?? '', h.final_score.gross_error ? 'yes' : 'no', ...cl.criteria.map((k) => fa[k.id] ?? '')]);
  }
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="cqa-results.csv"' });
  res.end(csv);
});

// ---------------------------------------------------------------- static
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function serveStatic(req, res, pathname) {
  let file;
  if (pathname === '/lib/scoring.js') file = path.join(ROOT, 'lib', 'scoring.js');
  else file = path.join(ROOT, 'public', pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(ROOT)) return fail(res, 403, 'forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (!path.extname(pathname)) return serveStatic(req, res, '/');
      return fail(res, 404, 'not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  // Allow embedding the UI elsewhere (e.g. a Dynamics 365 web resource pointing at this API).
  res.setHeader('access-control-allow-origin', process.env.CQA_CORS_ORIGIN || '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  if (url.pathname.startsWith('/api/')) {
    for (const r of routes) {
      const m = r.method === req.method && url.pathname.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
      try {
        return await r.handler(req, res, params, url);
      } catch (e) {
        console.error(e);
        return fail(res, 500, String(e.message || e));
      }
    }
    return fail(res, 404, 'Неизвестный метод API');
  }
  serveStatic(req, res, decodeURIComponent(url.pathname));
});

server.listen(PORT, () => {
  const e = engineInfo();
  console.log(`CQA ▸ http://localhost:${PORT}  ·  движок: ${e.label}`);
});
