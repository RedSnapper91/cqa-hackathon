import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCheck, Scale } from 'lucide-react';
import { useWorkspace } from '../App';
import { api, fmtDate, post } from '../lib/api';
import { useApi } from '../lib/useApi';
import type { Appeal, Conversation, Judgment } from '../lib/types';
import { Empty, ErrorBox, Loading, Modal, Score, Status, useNotify } from '../components/ui';
import { Evidence } from '../components/EvaluationCards';
import Transcript from '../components/Transcript';
function ReviewDialog({
  appeal: a,
  onClose,
  onDone,
}: {
  appeal: Appeal;
  onClose: () => void;
  onDone: () => void;
}) {
  const c = a.criterion;
  const initial = a.current_judgment;
  const [action, setAction] = useState<'confirm' | 'change'>('confirm'),
    [value, setValue] = useState(
      initial.status === 'na'
        ? 'N/A'
        : c.kind === 'flag'
          ? initial.answer
          : String(initial.raw_score),
    ),
    [reason, setReason] = useState(''),
    [naReason, setNaReason] = useState(initial.na_reason ?? ''),
    [evidence, setEvidence] = useState<string[]>(initial.evidence_message_ids),
    [spanStart, setSpanStart] = useState(initial.checked_span?.start_message_id ?? ''),
    [spanEnd, setSpanEnd] = useState(initial.checked_span?.end_message_id ?? ''),
    [omission, setOmission] = useState(initial.omission),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [highlighted, setHighlighted] = useState<string[]>([]);
  const conversation = useApi<Conversation>('/conversations/' + a.conversation_id);
  const notify = useNotify();
  async function submit() {
    setBusy(true);
    try {
      const isNA = value === 'N/A';
      const raw = c.kind === 'flag' || isNA ? null : Number(value);
      const judgment: Judgment = {
        criterion_id: a.criterion_id,
        status: isNA ? 'na' : 'scored',
        answer: isNA
          ? 'N/A'
          : c.kind === 'binary'
            ? raw === 1
              ? c.yes_label
              : c.no_label
            : c.kind === 'flag'
              ? value
              : String(raw),
        raw_score: raw,
        reason: reason.trim(),
        na_reason: isNA ? naReason : null,
        evidence_message_ids: evidence,
        omission: !isNA && (omission || (c.kind === 'binary' && raw === 0)),
        checked_span: conversation.data
          ? {
              start_message_id: spanStart || conversation.data.messages[0].id,
              end_message_id: spanEnd || conversation.data.messages.at(-1)!.id,
            }
          : null,
        quotes: [],
        review_required: false,
        fact_verification_needed: initial.fact_verification_needed,
      };
      await post('/appeals/' + a.id + '/decision', {
        action,
        reason,
        judgment: action === 'change' ? judgment : undefined,
      });
      notify('Review decision saved. Final score recomputed; original preserved.');
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Review ${a.criterion_id} · ${a.external_id}`} onClose={onClose}>
      <div className="review-dialog-context">
        <strong>{c.title}</strong>
        <p>{a.comment}</p>
        <small>
          Original AI/test: {a.original_judgment.answer} · current finalized:{' '}
          {a.current_judgment.answer}
        </small>
      </div>
      {conversation.data && (
        <details className="review-transcript" open>
          <summary>Inspect transcript & original evidence</summary>
          <div className="review-transcript-scroll">
            <Transcript conversation={conversation.data} highlighted={highlighted} />
          </div>
          <Evidence
            judgment={a.original_judgment}
            conversation={conversation.data}
            onHighlight={setHighlighted}
          />
        </details>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          Decision
          <select
            aria-label="Review decision"
            value={action}
            onChange={(e) => setAction(e.target.value as 'confirm' | 'change')}
          >
            <option value="confirm">Confirm current judgment</option>
            <option value="change">Change judgment</option>
          </select>
        </label>
        {action === 'change' && (
          <>
            <label>
              Final answer / raw score
              <select
                aria-label="Revised score"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                {c.kind === 'flag'
                  ? [c.no_label, c.yes_label].map((label) => <option key={label}>{label}</option>)
                  : c.allowed_scores.map((score) => (
                      <option key={score} value={score}>
                        {c.kind === 'binary' ? (score === 1 ? c.yes_label : c.no_label) : score}
                      </option>
                    ))}
                {c.na_allowed && <option>N/A</option>}
              </select>
            </label>
            {value === 'N/A' && (
              <label>
                N/A reason
                <textarea
                  aria-label="Review N/A reason"
                  required
                  rows={2}
                  value={naReason}
                  onChange={(e) => setNaReason(e.target.value)}
                />
                <small>{c.na_rule}</small>
              </label>
            )}
            <fieldset className="review-evidence-picker">
              <legend>Supporting transcript messages</legend>
              <div>
                {conversation.data?.messages.map((m) => (
                  <label className="checkbox-label" key={m.id}>
                    <input
                      type="checkbox"
                      aria-label={`Use message #${m.ordinal + 1} as review evidence`}
                      checked={evidence.includes(m.id)}
                      onChange={(e) =>
                        setEvidence(
                          e.target.checked
                            ? [...evidence, m.id]
                            : evidence.filter((id) => id !== m.id),
                        )
                      }
                    />
                    <span>
                      <strong>
                        #{m.ordinal + 1} · {m.speaker} · {m.timestamp}
                      </strong>
                      <small>{m.text}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={omission}
                onChange={(e) => setOmission(e.target.checked)}
              />
              Action was omitted · inspect the checked interval
            </label>
            <div className="form-grid">
              <label>
                Checked interval starts
                <select
                  aria-label="Checked interval starts"
                  value={spanStart || conversation.data?.messages[0]?.id || ''}
                  onChange={(e) => setSpanStart(e.target.value)}
                >
                  {conversation.data?.messages.map((m) => (
                    <option key={m.id} value={m.id}>
                      #{m.ordinal + 1} · {m.speaker} · {m.timestamp}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Checked interval ends
                <select
                  aria-label="Checked interval ends"
                  value={spanEnd || conversation.data?.messages.at(-1)?.id || ''}
                  onChange={(e) => setSpanEnd(e.target.value)}
                >
                  {conversation.data?.messages.map((m) => (
                    <option key={m.id} value={m.id}>
                      #{m.ordinal + 1} · {m.speaker} · {m.timestamp}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
        <label>
          Required review reason
          <textarea
            aria-label="Reviewer reason"
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && <ErrorBox error={error} />}
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={
              busy ||
              !reason.trim() ||
              !conversation.data ||
              (action === 'change' && !evidence.length)
            }
          >
            <CheckCheck size={15} />
            {busy ? 'Saving…' : 'Save review decision'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function Appeals() {
  const { reviewer, revision, refresh } = useWorkspace();
  const [status, setStatus] = useState('pending'),
    [reviewing, setReviewing] = useState<Appeal | null>(null),
    [busy, setBusy] = useState('');
  const { data, error, loading, reload } = useApi<Appeal[]>(
    '/appeals' + (status ? '?status=' + status : ''),
    revision,
    3000,
  );
  const notify = useNotify();
  async function review(id: string) {
    setBusy(id);
    try {
      setReviewing(await api<Appeal>('/appeals/' + id));
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">HUMAN JUDGMENT, PRESERVED</div>
          <h1>
            Appeals & review<span className="heading-dot">.</span>
          </h1>
          <p>Inspect the evidence. Make a reasoned decision. Keep a complete audit trail.</p>
        </div>
        <span className="status pending">
          <Scale size={14} />
          {reviewer ? 'Reviewer mode' : 'Supervisor mode'}
        </span>
      </div>
      {!reviewer && (
        <div className="notice">
          Switch to Reviewer mode in the top bar to confirm or change an appealed criterion. This
          demo switch is not authentication.
        </div>
      )}
      <div className="tab-bar">
        {[
          ['pending', 'Awaiting review'],
          ['changed', 'Changed'],
          ['confirmed', 'Confirmed'],
          ['', 'All appeals'],
        ].map(([value, label]) => (
          <button
            className={value === status ? 'active' : ''}
            key={value}
            onClick={() => setStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <section className="panel">
          <Empty title="No appeals in this queue">
            <p>
              Open a completed conversation report and choose Appeal criterion to start a review.
            </p>
            <Link className="btn secondary" to="/conversations">
              Browse conversations
            </Link>
          </Empty>
        </section>
      ) : (
        <div className="appeal-list">
          {data.map((a) => (
            <article className="panel appeal-card" key={a.id}>
              <div className="appeal-card-heading">
                <div>
                  <span className="criterion-code">{a.criterion_id}</span>
                  <h3>{a.criterion.title}</h3>
                </div>
                <Status value={a.status} />
              </div>
              <Link
                className="text-link"
                to={`/conversations/${a.conversation_id}?run=${a.run_id}`}
              >
                {a.external_id}
                <ArrowUpRight size={14} />
              </Link>
              <blockquote>{a.comment}</blockquote>
              <div className="appeal-result">
                <div>
                  <small>Original criterion</small>
                  <strong>{a.original_judgment.answer}</strong>
                </div>
                <div>
                  <small>Current criterion</small>
                  <strong>{a.current_judgment.answer}</strong>
                </div>
                <div>
                  <small>Original total</small>
                  <Score value={a.original_score} small />
                </div>
                <div>
                  <small>Final total</small>
                  <Score value={a.final_score} small />
                </div>
              </div>
              {a.decision && (
                <div className="review-decision">
                  <strong>
                    {a.decision.reviewer} · {fmtDate(a.decision.created_at)}
                  </strong>
                  <p>{a.decision.reason}</p>
                  <small>
                    Criterion {a.decision.before_judgment.answer} →{' '}
                    {a.decision.after_judgment.answer} · total {a.decision.before_score ?? 'N/A'} →{' '}
                    {a.decision.after_score ?? 'N/A'}
                  </small>
                </div>
              )}
              <div className="appeal-card-footer">
                <small>
                  {a.actor} · {fmtDate(a.created_at)}
                </small>
                {a.status === 'pending' && (
                  <button
                    className="btn primary"
                    disabled={!reviewer || busy === a.id}
                    onClick={() => void review(a.id)}
                  >
                    {busy === a.id ? 'Loading…' : 'Review evidence & decide'}
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {reviewing && (
        <ReviewDialog
          appeal={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => {
            reload();
            refresh();
          }}
        />
      )}
    </div>
  );
}
