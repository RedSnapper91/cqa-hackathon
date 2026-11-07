import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, ListPlus, Save, Trash2, LockKeyhole, Check } from 'lucide-react';
import { useWorkspace } from '../App';
import { useApi } from '../lib/useApi';
import { fmtDate, post } from '../lib/api';
import type { Checklist, Criterion } from '../lib/types';
import { ErrorBox, Loading, useNotify } from '../components/ui';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function CriterionEditor({
  criterion: c,
  onChange,
  onDelete,
  onMove,
  first,
  last,
}: {
  criterion: Criterion;
  onChange: (c: Criterion) => void;
  onDelete: () => void;
  onMove: (offset: number) => void;
  first: boolean;
  last: boolean;
}) {
  const [expanded, setExpanded] = useState(false),
    [scale, setScale] = useState(c.allowed_scores.join(', '));
  useEffect(() => {
    setScale(c.allowed_scores.join(', '));
  }, [c.id]);
  function update<K extends keyof Criterion>(key: K, value: Criterion[K]) {
    onChange({ ...c, [key]: value });
  }
  function kind(value: Criterion['kind']) {
    onChange({
      ...c,
      kind: value,
      weight: value === 'flag' ? 0 : c.weight,
      max_score: 1,
      allowed_scores: [0, 1],
      na_allowed: value === 'flag' ? false : c.na_allowed,
      is_gross_violation_flag: value === 'flag' ? c.is_gross_violation_flag : false,
    });
    setScale('0, 1');
  }
  return (
    <article className={`editor-criterion ${!c.active ? 'inactive' : ''}`}>
      <div className="editor-criterion-heading">
        <span className="criterion-code">{c.id}</span>
        <button
          className="criterion-expand"
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {c.title}
          <small>{c.section}</small>
        </button>
        <span className="version-tag">{c.kind === 'flag' ? 'Flag' : `${c.weight} pts`}</span>
        <button
          className="icon-btn"
          type="button"
          aria-label={`Move ${c.id} up`}
          disabled={first}
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={15} />
        </button>
        <button
          className="icon-btn"
          type="button"
          aria-label={`Move ${c.id} down`}
          disabled={last}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={15} />
        </button>
        <button
          className="icon-btn danger-text"
          type="button"
          aria-label={`Delete ${c.id}`}
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {expanded && (
        <div className="editor-fields">
          <div className="form-grid">
            <label>
              Stable criterion ID
              <input
                required
                pattern="[A-Za-z][A-Za-z0-9_-]{0,39}"
                aria-label={`Criterion ID ${c.id}`}
                value={c.id}
                onChange={(e) => update('id', e.target.value)}
              />
            </label>
            <label>
              Section
              <input
                required
                aria-label={`Section ${c.id}`}
                value={c.section}
                onChange={(e) => update('section', e.target.value)}
              />
            </label>
          </div>
          <label>
            Criterion title
            <input
              required
              aria-label={`Title ${c.id}`}
              value={c.title}
              onChange={(e) => update('title', e.target.value)}
            />
          </label>
          <label>
            Description & evaluation instructions
            <textarea
              required
              aria-label={`Description ${c.id}`}
              rows={4}
              value={c.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </label>
          <div className="form-grid three">
            <label>
              Response type
              <select
                aria-label={`Response type ${c.id}`}
                value={c.kind}
                onChange={(e) => kind(e.target.value as Criterion['kind'])}
              >
                <option value="binary">Binary · Yes / No</option>
                <option value="discrete_scale">Discrete numeric scale</option>
                <option value="flag">Flag · no points</option>
              </select>
            </label>
            <label>
              Weight
              <input
                type="number"
                min="0"
                max="10000"
                step="any"
                required
                aria-label={`Weight ${c.id}`}
                disabled={c.kind === 'flag'}
                value={c.weight}
                onChange={(e) => update('weight', Number(e.target.value))}
              />
            </label>
            <label>
              Maximum raw score
              <input
                type="number"
                min="0.000001"
                step="any"
                required
                disabled={c.kind !== 'discrete_scale'}
                aria-label={`Maximum score ${c.id}`}
                value={c.max_score}
                onChange={(e) => update('max_score', Number(e.target.value))}
              />
            </label>
          </div>
          {c.kind === 'discrete_scale' ? (
            <label>
              Allowed numeric scores · comma separated
              <input
                required
                aria-label={`Allowed scores ${c.id}`}
                value={scale}
                onChange={(e) => {
                  const value = e.target.value;
                  setScale(value);
                  const scores = value.split(',').map((s) => Number(s.trim()));
                  const valid =
                    value.trim() !== '' &&
                    !value.endsWith(',') &&
                    scores.every((s) => Number.isFinite(s) && s >= 0) &&
                    new Set(scores).size === scores.length;
                  e.target.setCustomValidity(
                    valid ? '' : 'Enter unique nonnegative numeric scores',
                  );
                  if (valid)
                    onChange({ ...c, allowed_scores: scores, max_score: Math.max(...scores) });
                }}
              />
            </label>
          ) : (
            <div className="form-grid">
              <label>
                Yes answer label
                <input
                  required
                  aria-label={`Yes label ${c.id}`}
                  value={c.yes_label}
                  onChange={(e) => update('yes_label', e.target.value)}
                />
              </label>
              <label>
                No answer label
                <input
                  required
                  aria-label={`No label ${c.id}`}
                  value={c.no_label}
                  onChange={(e) => update('no_label', e.target.value)}
                />
              </label>
            </div>
          )}
          <div className="rubric-editor">
            <strong>Precise grading rubric</strong>
            {c.allowed_scores.map((score) => (
              <label key={score}>
                <span>{score}</span>
                <input
                  aria-label={`Rubric ${c.id} score ${score}`}
                  placeholder={`Instructions for score ${score}`}
                  value={c.rubric[String(score)] ?? ''}
                  onChange={(e) =>
                    update('rubric', { ...c.rubric, [String(score)]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
          <div className="form-grid">
            <label className="checkbox-label">
              <input
                type="checkbox"
                disabled={c.kind === 'flag'}
                checked={c.na_allowed}
                onChange={(e) => update('na_allowed', e.target.checked)}
              />
              Permit N/A only under an explicit rule
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={c.active}
                onChange={(e) => update('active', e.target.checked)}
              />
              Active in this version
            </label>
          </div>
          {c.na_allowed && (
            <label>
              Exact N/A applicability condition
              <textarea
                required
                aria-label={`N/A rule ${c.id}`}
                rows={2}
                value={c.na_rule}
                onChange={(e) => update('na_rule', e.target.value)}
              />
            </label>
          )}
          {c.kind === 'flag' && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={c.is_gross_violation_flag}
                onChange={(e) => update('is_gross_violation_flag', e.target.checked)}
              />
              Triggers the separate serious-violation flag
            </label>
          )}
        </div>
      )}
    </article>
  );
}
export default function Checklists() {
  const { revision, refresh } = useWorkspace();
  const { data, error, loading, reload } = useApi<Checklist[]>('/checklists', revision);
  const [draft, setDraft] = useState<Checklist | null>(null),
    [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState(''),
    [saved, setSaved] = useState(false);
  const notify = useNotify();
  useEffect(() => {
    if (!draft && data?.length) setDraft(clone(data[0]));
  }, [draft, data]);
  function update(criteria: Criterion[]) {
    if (draft) setDraft({ ...draft, criteria });
    setSaved(false);
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    setSaveError('');
    try {
      const next = await post<Checklist>('/checklists', {
        name: draft.name,
        parent_id: draft.id,
        criteria: draft.criteria,
      });
      setDraft(clone(next));
      setSaved(true);
      refresh();
      notify(`Checklist v${next.version} saved. Prior versions remain unchanged.`);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!draft) return <Loading />;
  const total = draft.criteria
    .filter((c) => c.active && c.kind !== 'flag')
    .reduce((sum, c) => sum + c.weight, 0);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONFIGURABLE BY DESIGN</div>
          <h1>
            Checklist studio<span className="heading-dot">.</span>
          </h1>
          <p>Your standards, clearly defined. Every saved version is an immutable snapshot.</p>
        </div>
        <span className="status completed">
          <LockKeyhole size={13} />
          Version history protected
        </span>
      </div>
      <div className="checklist-layout">
        <aside className="panel version-sidebar">
          <div className="panel-heading">
            <h3>Saved versions</h3>
            <Copy size={16} />
          </div>
          {data?.map((v) => (
            <button
              key={v.id}
              className={`version-item ${draft.id === v.id ? 'active' : ''}`}
              onClick={() => {
                setDraft(clone(v));
                setSaveError('');
                setSaved(false);
              }}
            >
              <span className="version-circle">v{v.version}</span>
              <span>
                <strong>{v.name}</strong>
                <small>
                  {fmtDate(v.created_at)} · {v.criteria.filter((c) => c.active).length} criteria
                </small>
              </span>
            </button>
          ))}
          <div className="version-info">
            <LockKeyhole size={18} />
            <p>
              Editing a saved version creates a new version. Existing reports retain their original
              rules and evidence.
            </p>
          </div>
        </aside>
        <form
          className="checklist-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <section className="panel checklist-title">
            <div>
              <label>
                Checklist name
                <input
                  aria-label="Checklist name"
                  required
                  value={draft.name}
                  onChange={(e) => {
                    setDraft({ ...draft, name: e.target.value });
                    setSaved(false);
                  }}
                />
              </label>
              <p>
                Editing from <strong>v{draft.version}</strong> · saved changes create{' '}
                <strong>a new version</strong>
              </p>
            </div>
            <div className="weight-total">
              <strong>{total}</strong>
              <span>base weight</span>
              <small>Normalized to 100</small>
            </div>
          </section>
          <div className="editor-guidance">
            <ListPlus size={16} />
            <span>
              Expand a criterion to edit its rules, response scale, labels, weight, and N/A
              condition.
            </span>
          </div>
          {draft.criteria.map((c, index) => (
            <CriterionEditor
              key={`${draft.id}:${index}`}
              criterion={c}
              onChange={(next) =>
                update(draft.criteria.map((old, i) => (i === index ? next : old)))
              }
              onDelete={() => update(draft.criteria.filter((_, i) => i !== index))}
              onMove={(offset) => {
                const next = [...draft.criteria];
                [next[index], next[index + offset]] = [next[index + offset], next[index]];
                update(next);
              }}
              first={index === 0}
              last={index === draft.criteria.length - 1}
            />
          ))}
          <button
            type="button"
            className="add-criterion"
            onClick={() => {
              const c: Criterion = {
                id: `CUSTOM_${draft.criteria.length + 1}`,
                title: 'Новый критерий',
                section: 'НОВАЯ СЕКЦИЯ',
                description: 'Опишите точные условия оценки работы оператора.',
                kind: 'binary',
                weight: 10,
                allowed_scores: [0, 1],
                max_score: 1,
                yes_label: 'Да',
                no_label: 'Нет',
                rubric: { '0': 'Условие не выполнено.', '1': 'Условие выполнено.' },
                na_allowed: false,
                na_rule: '',
                evidence_required: true,
                is_gross_violation_flag: false,
                active: true,
              };
              let n = draft.criteria.length + 1;
              while (draft.criteria.some((old) => old.id === c.id)) c.id = `CUSTOM_${++n}`;
              update([...draft.criteria, c]);
            }}
          >
            <ListPlus size={18} />
            Add criterion
          </button>
          {saveError && <ErrorBox error={saveError} />}
          <div className="save-bar">
            <span>
              {saved ? (
                <>
                  <Check size={16} />v{draft.version} saved and available for evaluation
                </>
              ) : (
                <>
                  <LockKeyhole size={15} />
                  Earlier versions and evaluations are preserved
                </>
              )}
            </span>
            <button className="btn primary" disabled={busy || !draft.criteria.length}>
              <Save size={16} />
              {busy ? 'Saving…' : 'Save as new version'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
