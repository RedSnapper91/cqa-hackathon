import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GitCompareArrows } from 'lucide-react';
import { useWorkspace } from '../App';
import { useApi } from '../lib/useApi';
import type { Checklist, Conversation, ConversationRow, Page, Run } from '../lib/types';
import { Empty, ErrorBox, Score, Status } from '../components/ui';
import { JudgmentCard } from '../components/EvaluationCards';
import Transcript from '../components/Transcript';
type Comparison = {
  a: { checklist: Checklist; evaluation: Run | null };
  b: { checklist: Checklist; evaluation: Run | null };
};
function Results({ cid, a, b }: { cid: string; a: string; b: string }) {
  const { revision } = useWorkspace();
  const result = useApi<Comparison>(
      `/conversations/${cid}/compare?version_a=${a}&version_b=${b}`,
      revision,
      2000,
    ),
    conversation = useApi<Conversation>('/conversations/' + cid);
  const [highlighted, setHighlighted] = useState<string[]>([]);
  if (result.error) return <ErrorBox error={result.error} retry={result.reload} />;
  if (!result.data || !conversation.data) return <Empty title="Loading comparison…" />;
  const conv = conversation.data;
  return (
    <>
      <div className="compare-grid">
        {(['a', 'b'] as const).map((key) => {
          const side = result.data![key],
            run = side.evaluation;
          return (
            <section className="panel comparison-column" key={key}>
              <div className="comparison-header">
                <span className="eyebrow">CHECKLIST V{side.checklist.version}</span>
                <h3>{side.checklist.name}</h3>
                <Score value={run?.final?.score} />
                <p>
                  {run?.final?.gross_violation
                    ? 'SERIOUS VIOLATION'
                    : 'Gross flag: ' + (run?.final ? 'none identified' : 'not assessed')}
                </p>
                {run && <Status value={run.status} />}
              </div>
              {!run ? (
                <Empty title="Not evaluated under this version">
                  <Link to={`/conversations/${cid}`}>Open conversation to run evaluation</Link>
                </Empty>
              ) : !run.final ? (
                <Empty
                  title={run.status === 'failed' ? 'Evaluation failed' : 'Evaluation in progress'}
                >
                  <p>{run.error}</p>
                </Empty>
              ) : (
                <>
                  <p className="comparison-original">
                    Original {run.provider === 'test-only' ? 'test' : 'AI'} score{' '}
                    {run.original?.score ?? 'N/A'} · finalized {run.final.score ?? 'N/A'}
                  </p>
                  {side.checklist.criteria
                    .filter((c) => c.active)
                    .map((c) => {
                      const j = run.final!.criteria.find((j) => j.criterion_id === c.id);
                      return (
                        j && (
                          <JudgmentCard
                            key={c.id}
                            criterion={c}
                            judgment={j}
                            conversation={conv}
                            onHighlight={setHighlighted}
                          />
                        )
                      );
                    })}
                </>
              )}
            </section>
          );
        })}
      </div>
      <details className="compare-transcript" open={highlighted.length > 0 || undefined}>
        <summary>Shared original transcript · click evidence to highlight</summary>
        <Transcript conversation={conv} highlighted={highlighted} />
      </details>
    </>
  );
}
export default function Compare() {
  const { revision } = useWorkspace();
  const [params] = useSearchParams();
  const [cid, setCid] = useState(params.get('conversation') ?? ''),
    [a, setA] = useState('v1'),
    [b, setB] = useState('');
  const [search, setSearch] = useState('');
  const versions = useApi<Checklist[]>('/checklists', revision),
    conversations = useApi<Page<ConversationRow>>(
      '/conversations?size=100&search=' + encodeURIComponent(search),
      revision,
    );
  const chosenB = b || versions.data?.[0]?.id || '';
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CHANGE THE RULES. KEEP THE HISTORY.</div>
          <h1>
            Version comparison<span className="heading-dot">.</span>
          </h1>
          <p>Compare actual reports for one conversation under two immutable checklist versions.</p>
        </div>
        <GitCompareArrows size={28} className="muted" />
      </div>
      <section className="panel comparison-selectors">
        <label>
          Find conversation
          <input
            aria-label="Find comparison conversation"
            value={search}
            placeholder="Search transcript or ID"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Conversation
          <select
            aria-label="Comparison conversation"
            value={cid}
            onChange={(e) => setCid(e.target.value)}
          >
            <option value="">Select conversation</option>
            {conversations.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.external_id} · {c.group_id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Version A
          <select aria-label="Version A" value={a} onChange={(e) => setA(e.target.value)}>
            {versions.data?.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version} · {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Version B
          <select aria-label="Version B" value={chosenB} onChange={(e) => setB(e.target.value)}>
            {versions.data?.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version} · {v.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      {cid && a && chosenB ? (
        <Results key={cid + a + chosenB} cid={cid} a={a} b={chosenB} />
      ) : (
        <section className="panel">
          <Empty title="Choose a conversation to compare">
            <p>Only saved evaluation runs appear here. Missing evaluations are clearly labeled.</p>
          </Empty>
        </section>
      )}
    </div>
  );
}
