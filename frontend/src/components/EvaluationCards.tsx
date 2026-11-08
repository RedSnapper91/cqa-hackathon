import { useState } from 'react';
import { AlertTriangle, Flag, Link2, MessageSquareText, ScanLine } from 'lucide-react';
import type { Checklist, Conversation, Judgment, Run, ScoredJudgment } from '../lib/types';
import { post } from '../lib/api';
import { useNotify, ErrorBox, Modal, Score } from './ui';
export function Evidence({
  judgment,
  conversation,
  onHighlight,
}: {
  judgment: Judgment;
  conversation: Conversation;
  onHighlight: (ids: string[]) => void;
}) {
  const notify = useNotify();
  function jump(ids: string[]) {
    if (ids.some((id) => !conversation.messages.some((m) => m.id === id))) {
      notify('The referenced transcript message is missing.', true);
      return;
    }
    onHighlight(ids);
  }
  const span = judgment.checked_span;
  const start = conversation.messages.findIndex((m) => m.id === span?.start_message_id),
    end = conversation.messages.findIndex((m) => m.id === span?.end_message_id);
  return (
    <div className="evidence">
      <div className="evidence-label">
        <Link2 size={12} />
        TRANSCRIPT EVIDENCE
      </div>
      <div className="evidence-chips">
        {judgment.evidence_message_ids.map((id) => {
          const m = conversation.messages.find((m) => m.id === id);
          return (
            <button
              key={id}
              className="evidence-chip"
              onClick={() => jump([id])}
              title={m?.text ?? 'Message missing'}
            >
              <MessageSquareText size={12} />
              {m ? `#${m.ordinal + 1} · ${m.speaker} · ${m.timestamp}` : 'Missing message'}
            </button>
          );
        })}
      </div>
      {judgment.evidence_message_ids.map((id) => {
        const m = conversation.messages.find((m) => m.id === id);
        return m && <blockquote key={id}>{m.text}</blockquote>;
      })}
      {span && (
        <button
          className="span-button"
          onClick={() =>
            start < 0 || end < start
              ? notify('The checked transcript interval is missing.', true)
              : jump(conversation.messages.slice(start, end + 1).map((m) => m.id))
          }
        >
          <ScanLine size={13} />
          {judgment.omission ? 'Omission checked' : 'Checked interval'} · #{start + 1}–#{end + 1}
        </button>
      )}
    </div>
  );
}
function AppealForm({
  judgment,
  runId,
  onDone,
  onClose,
}: {
  judgment: Judgment;
  runId: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const notify = useNotify();
  return (
    <Modal title={`Appeal criterion ${judgment.criterion_id}`} onClose={onClose}>
      <p className="muted">
        Explain what should be reviewed. The original assessment and evidence will be preserved.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await post('/appeals', { run_id: runId, criterion_id: judgment.criterion_id, comment });
            notify('Appeal saved. Open Appeals & review to review it.');
            onDone();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Reason for appeal
          <textarea
            aria-label="Appeal comment"
            required
            minLength={1}
            maxLength={4000}
            rows={5}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        {error && <ErrorBox error={error} />}
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !comment.trim()}>
            {busy ? 'Saving…' : 'Submit appeal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function JudgmentCard({
  criterion,
  judgment,
  original,
  conversation,
  onHighlight,
  onAppeal,
  pending,
}: {
  criterion: Checklist['criteria'][number];
  judgment: ScoredJudgment;
  original?: ScoredJudgment;
  conversation: Conversation;
  onHighlight: (ids: string[]) => void;
  onAppeal?: () => void;
  pending?: boolean;
}) {
  const changed =
    original && (original.answer !== judgment.answer || original.status !== judgment.status);
  return (
    <article className={`criterion-card ${judgment.status === 'na' ? 'not-applicable' : ''}`}>
      <div className="criterion-top">
        <span className="criterion-code">{criterion.id}</span>
        <h4>{criterion.title}</h4>
        <span
          className={`answer ${judgment.status === 'na' ? 'na' : criterion.kind === 'flag' ? (judgment.answer === criterion.yes_label ? 'fail' : 'neutral') : judgment.raw_score === criterion.max_score ? 'pass' : judgment.raw_score === 0 ? 'fail' : 'partial'}`}
        >
          {judgment.answer}
          {criterion.kind === 'discrete_scale' && judgment.status !== 'na' && (
            <small> / {criterion.max_score}</small>
          )}
        </span>
      </div>
      <div className="criterion-meta">
        <span>
          {criterion.kind === 'flag' ? 'Separate flag · no points' : `Weight ${criterion.weight}`}
        </span>
        {criterion.kind !== 'flag' && (
          <span>
            {judgment.contribution !== null
              ? `${Number(judgment.contribution).toLocaleString(undefined, { maximumFractionDigits: 4 })} / ${criterion.weight} weighted points`
              : 'Weight redistributed over applicable criteria'}
          </span>
        )}
        {changed && <span className="reviewed-tag">Reviewed · original {original.answer}</span>}
      </div>
      <p className="rationale">{judgment.reason}</p>
      {judgment.status === 'na' && (
        <div className="na-explanation">
          <strong>N/A reason</strong>
          <p>{judgment.na_reason}</p>
          <small>Rule: {criterion.na_rule}</small>
        </div>
      )}
      {judgment.review_required && (
        <div className="review-warning">
          <AlertTriangle size={14} />
          {judgment.fact_verification_needed
            ? 'Fact verification needed · rating is provisional'
            : 'Human review requested'}
        </div>
      )}
      <Evidence judgment={judgment} conversation={conversation} onHighlight={onHighlight} />
      {onAppeal && (
        <div className="criterion-footer">
          <button className="text-button" disabled={pending} onClick={onAppeal}>
            <Flag size={13} />
            {pending ? 'Appeal pending' : 'Appeal criterion'}
          </button>
          <span>Evidence preserved in original language</span>
        </div>
      )}
    </article>
  );
}
export default function EvaluationCards({
  run,
  checklist,
  conversation,
  onHighlight,
  onRefresh,
}: {
  run: Run;
  checklist: Checklist;
  conversation: Conversation;
  onHighlight: (ids: string[]) => void;
  onRefresh: () => void;
}) {
  const [appealing, setAppealing] = useState<Judgment | null>(null);
  if (!run.final) return null;
  const final = run.final;
  const sections = [...new Set(checklist.criteria.filter((c) => c.active).map((c) => c.section))];
  return (
    <div className="evaluation-cards">
      <div className="panel score-summary">
        <div>
          <span className="eyebrow">FINAL WEIGHTED SCORE · V{checklist.version}</span>
          <Score value={final.score} />
          <p>
            Original {run.provider === 'test-only' ? 'test' : 'AI'} score:{' '}
            <strong>{run.original?.score ?? 'N/A'}</strong>
          </p>
        </div>
        <div className="score-formula">
          <strong>
            {Number(final.earned).toLocaleString(undefined, { maximumFractionDigits: 4 })} /{' '}
            {final.denominator}
          </strong>
          <span>applicable weighted points</span>
          <small>Normalized to 100 · half-up rounding</small>
        </div>
      </div>
      {final.gross_violation && (
        <div className="notice danger">
          <AlertTriangle size={20} />
          <strong>SERIOUS VIOLATION · flagged separately; numeric score is preserved.</strong>
        </div>
      )}
      {run.warnings.length > 0 &&
        run.warnings.map((warning, i) => (
          <div className="notice" key={i}>
            {warning}
          </div>
        ))}
      {sections.map((section) => {
        const summary = final.sections[section];
        return (
          <section className="evaluation-section" key={section}>
            <div className="section-title">
              <h3>{section}</h3>
              <span>
                {summary?.flag_only
                  ? summary.flagged
                    ? 'Violation identified'
                    : 'No gross violation'
                  : summary?.score != null
                    ? `${summary.score} / 100`
                    : 'N/A'}
              </span>
            </div>
            {checklist.criteria
              .filter((c) => c.active && c.section === section)
              .map((c) => {
                const judgment = final.criteria.find((j) => j.criterion_id === c.id);
                if (!judgment) return null;
                return (
                  <JudgmentCard
                    key={c.id}
                    criterion={c}
                    judgment={judgment}
                    original={run.original?.criteria.find((j) => j.criterion_id === c.id)}
                    conversation={conversation}
                    onHighlight={onHighlight}
                    onAppeal={() => setAppealing(judgment)}
                    pending={run.appeals?.some(
                      (a) => a.criterion_id === c.id && a.status === 'pending',
                    )}
                  />
                );
              })}
          </section>
        );
      })}
      {run.appeals?.some((a) => a.decision) && (
        <section className="panel review-history">
          <h3>Review history</h3>
          {run.appeals
            .filter((a) => a.decision)
            .map((a) => (
              <div key={a.id}>
                <strong>
                  {a.criterion_id} · {a.decision?.action === 'change' ? 'Changed' : 'Confirmed'} by{' '}
                  {a.decision?.reviewer}
                </strong>
                <p>{a.decision?.reason}</p>
                <small>
                  Criterion {a.decision?.before_judgment.answer} →{' '}
                  {a.decision?.after_judgment.answer} · total {a.decision?.before_score ?? 'N/A'} →{' '}
                  {a.decision?.after_score ?? 'N/A'} ·{' '}
                  {new Date(a.decision!.created_at).toLocaleString()}
                </small>
              </div>
            ))}
        </section>
      )}
      {run.usage && (
        <details className="panel usage-panel">
          <summary>Provider usage & reproducibility</summary>
          <p>
            {run.provider} · {run.model} · {run.usage.attempts} call(s) · {run.usage.latency_ms} ms
          </p>
          <p>
            {run.usage.input_tokens} input / {run.usage.output_tokens} output /{' '}
            {run.usage.thinking_tokens} reasoning tokens
          </p>
          <p>
            {run.usage.estimated_cost_usd !== null
              ? `Estimated total $${run.usage.estimated_cost_usd} using configured per-million rates, including measured retries.`
              : 'Cost unavailable — configure MODEL_INPUT_USD_PER_MILLION and MODEL_OUTPUT_USD_PER_MILLION.'}
          </p>
          {!run.usage.usage_complete && (
            <p>Some failed calls did not report token usage; total cost may be higher.</p>
          )}
        </details>
      )}
      {appealing && (
        <AppealForm
          judgment={appealing}
          runId={run.id}
          onDone={onRefresh}
          onClose={() => setAppealing(null)}
        />
      )}
    </div>
  );
}
