// Scoring rules from the CQA checklist (page 2, "Порядок расчёта").
// Shared between the Node server and the browser (plain ES module, no deps).
//
// 1. N/A only where allowed.
// 2. "Yes" = full weight, "No" = 0. A scale criterion takes one of its steps.
// 3. Scale points are proportional to weight; the top step gives the full weight.
// 4. N/A criteria are excluded and their weight is redistributed proportionally
//    among applicable criteria, so the maximum stays 100.
// 5. Total is rounded to 2 decimals. No applicable weighted criteria → no total.
//    Gross errors (flag criteria) are reported separately and carry no points.

export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function scaleMax(criterion) {
  const steps = (criterion.scale || []).map((s) => Number(s.value));
  return steps.length ? Math.max(...steps) : 0;
}

/** Snap any value to a legal answer for this criterion. */
export function normalizeAnswer(criterion, value) {
  if (value === null || value === undefined || value === '') return null;
  const v = typeof value === 'string' ? value.trim().toLowerCase() : value;
  if (v === 'na' || v === 'n/a') return criterion.allow_na ? 'na' : null;
  if (criterion.type === 'binary' || criterion.type === 'flag') {
    if (v === 'yes' || v === 'да' || v === true || v === 1 || v === '1') return 'yes';
    if (v === 'no' || v === 'нет' || v === false || v === 0 || v === '0') return 'no';
    return null;
  }
  if (criterion.type === 'scale') {
    const n = Number(v);
    if (Number.isNaN(n)) return null;
    const steps = (criterion.scale || []).map((s) => Number(s.value));
    if (!steps.length) return null;
    return steps.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), steps[0]);
  }
  return null;
}

/** Fraction of the weight earned (0..1), or null when not applicable. */
export function fractionFor(criterion, answer) {
  if (answer === 'na' || answer === null || answer === undefined) return null;
  if (criterion.type === 'binary') return answer === 'yes' ? 1 : 0;
  if (criterion.type === 'scale') {
    const max = scaleMax(criterion);
    return max > 0 ? Number(answer) / max : 0;
  }
  return null;
}

export function answerLabel(criterion, answer, lang = 'ru') {
  const L = {
    ru: { yes: 'Да', no: 'Нет', na: 'N/A', none: '—' },
    en: { yes: 'Yes', no: 'No', na: 'N/A', none: '—' },
    kz: { yes: 'Иә', no: 'Жоқ', na: 'N/A', none: '—' },
  }[lang] || { yes: 'Да', no: 'Нет', na: 'N/A', none: '—' };
  if (answer === null || answer === undefined) return L.none;
  if (answer === 'na') return L.na;
  if (criterion.type === 'scale') return `${answer} / ${scaleMax(criterion)}`;
  return L[answer] || String(answer);
}

/**
 * @param checklist {criteria:[...], sections:[...]}
 * @param answers   { [criterion_id]: 'yes'|'no'|'na'|number }
 */
export function computeScore(checklist, answers) {
  const criteria = checklist.criteria || [];
  const scored = criteria.filter((c) => c.type !== 'flag' && Number(c.weight) > 0);
  const configuredWeight = scored.reduce((s, c) => s + Number(c.weight), 0);

  const rows = criteria.map((c) => {
    const answer = answers[c.id] ?? null;
    if (c.type === 'flag') {
      return { criterion_id: c.id, type: 'flag', answer, flagged: answer === 'yes', applicable: true };
    }
    const fraction = fractionFor(c, answer);
    return {
      criterion_id: c.id,
      type: c.type,
      answer,
      weight: Number(c.weight) || 0,
      applicable: fraction !== null,
      fraction,
    };
  });

  const applicableWeight = rows
    .filter((r) => r.type !== 'flag' && r.applicable && r.weight > 0)
    .reduce((s, r) => s + r.weight, 0);

  let earnedRaw = 0;
  for (const r of rows) {
    if (r.type === 'flag') continue;
    if (!r.applicable || applicableWeight === 0) {
      r.effective_weight = 0;
      r.points = null;
      continue;
    }
    r.effective_weight = round2((r.weight / applicableWeight) * 100);
    r.points_raw = r.fraction * r.weight; // before redistribution
    r.points = round2(r.fraction * (r.weight / applicableWeight) * 100);
    earnedRaw += r.points_raw;
  }

  const total = applicableWeight > 0 ? round2((earnedRaw / applicableWeight) * 100) : null;

  const sections = (checklist.sections || []).map((s) => {
    const inSec = rows.filter((r) => {
      const c = criteria.find((x) => x.id === r.criterion_id);
      return c && c.section === s.id && r.type !== 'flag';
    });
    const max = inSec.filter((r) => r.applicable).reduce((a, r) => a + (r.effective_weight || 0), 0);
    const pts = inSec.filter((r) => r.applicable).reduce((a, r) => a + (r.points || 0), 0);
    return {
      section_id: s.id,
      title: s.title,
      points: round2(pts),
      max: round2(max),
      percent: max > 0 ? round2((pts / max) * 100) : null,
      has_scored: inSec.length > 0,
    };
  });

  const grossFlags = rows.filter((r) => r.type === 'flag' && r.flagged).map((r) => r.criterion_id);

  return {
    total,
    gross_error: grossFlags.length > 0,
    gross_flags: grossFlags,
    configured_weight: configuredWeight,
    applicable_weight: applicableWeight,
    na_count: rows.filter((r) => r.type !== 'flag' && !r.applicable).length,
    rows,
    sections,
  };
}

/** Apply reviewer decisions (appeals) on top of the original answers. */
export function finalAnswers(evaluation, appeals) {
  const answers = {};
  for (const c of evaluation.criteria) answers[c.criterion_id] = c.answer;
  for (const a of appeals || []) {
    if (a.evaluation_id === evaluation.id && a.status === 'changed' && a.decision) {
      answers[a.criterion_id] = a.decision.new_answer;
    }
  }
  return answers;
}
