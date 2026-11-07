// Evaluation model adapter — the single place where a real model plugs in.
//
// Today: a stub. If CQA_MODEL_URL is not set, the offline rule engine
// (lib/rules-engine.js) produces the verdicts so the whole UI works end to end.
//
// Later: set CQA_MODEL_URL to your model service. The server POSTs
//   { conversation: {conversation_id, channel, language, transcript:[{idx,timestamp,speaker,text}]},
//     checklist:    {criteria:[{id,title,description,na_rule,type,weight,allow_na,scale}]},
//     output_language: "ru" }
// and expects
//   { criteria: [{ criterion_id, answer: "yes"|"no"|"na"|<scale step>,
//                  explanation, evidence: [idx...], checked_range: [fromIdx,toIdx]|null,
//                  na_reason, confidence }],
//     model?: "name", cost_usd?: number }
// Answers are validated and snapped to legal values by lib/scoring.js.

import { evaluateWithRules } from './rules-engine.js';
import { normalizeAnswer } from './scoring.js';

export function engineInfo() {
  const url = process.env.CQA_MODEL_URL;
  return url
    ? { mode: 'model', label: process.env.CQA_MODEL_NAME || 'external model', url_configured: true }
    : { mode: 'stub', label: 'Заглушка: офлайн-правила', url_configured: false };
}

async function callModel(conv, checklist, outputLanguage) {
  const res = await fetch(process.env.CQA_MODEL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.CQA_MODEL_TOKEN ? { authorization: `Bearer ${process.env.CQA_MODEL_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      conversation: {
        conversation_id: conv.conversation_id,
        channel: conv.channel,
        language: conv.language,
        transcript: conv.transcript.map(({ idx, timestamp, speaker, text }) => ({ idx, timestamp, speaker, text })),
      },
      checklist: {
        criteria: checklist.criteria.map(({ id, title, description, na_rule, type, weight, allow_na, scale }) => ({
          id, title, description, na_rule, type, weight, allow_na, scale,
        })),
      },
      output_language: outputLanguage,
    }),
    signal: AbortSignal.timeout(Number(process.env.CQA_MODEL_TIMEOUT_MS || 120_000)),
  });
  if (!res.ok) throw new Error(`Модель вернула HTTP ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body.criteria)) throw new Error('Ответ модели без поля criteria[]');
  return body;
}

export async function evaluate(conv, checklist, { outputLanguage = 'ru' } = {}) {
  if (!process.env.CQA_MODEL_URL) return evaluateWithRules(conv, checklist);
  try {
    const body = await callModel(conv, checklist, outputLanguage);
    const byId = new Map(body.criteria.map((c) => [c.criterion_id, c]));
    const fallback = evaluateWithRules(conv, checklist);
    const criteria = checklist.criteria.map((crit, i) => {
      const m = byId.get(crit.id);
      const answer = m ? normalizeAnswer(crit, m.answer) : null;
      if (!m || answer === null) return { ...fallback.criteria[i], needs_review: true };
      return {
        criterion_id: crit.id,
        answer,
        explanation: String(m.explanation || ''),
        evidence: (m.evidence || []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < conv.transcript.length),
        checked_range: Array.isArray(m.checked_range) ? m.checked_range.map(Number) : null,
        na_reason: m.na_reason || null,
        confidence: typeof m.confidence === 'number' ? m.confidence : null,
      };
    });
    return { criteria, engine: 'model', model: body.model || engineInfo().label, cost_usd: body.cost_usd ?? null };
  } catch (err) {
    const r = evaluateWithRules(conv, checklist);
    return { ...r, engine: 'rules', fallback_reason: String(err.message || err) };
  }
}
