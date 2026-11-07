import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play, Download, GitCompareArrows, Loader2, FileCheck2 } from 'lucide-react';
import { useWorkspace } from '../App';
import { useApi } from '../lib/useApi';
import { downloadJSON, fmtDate, post } from '../lib/api';
import type { Checklist, Conversation, Run } from '../lib/types';
import { Empty, ErrorBox, Loading, Status, useNotify } from '../components/ui';
import Transcript from '../components/Transcript';
import EvaluationCards from '../components/EvaluationCards';
function Report({
  id,
  conversation,
  checklist,
  onHighlight,
  onSettled,
}: {
  id: string;
  conversation: Conversation;
  checklist: Checklist;
  onHighlight: (ids: string[]) => void;
  onSettled: () => void;
}) {
  const { revision, refresh } = useWorkspace();
  const { data, error, loading, reload } = useApi<Run>('/evaluations/' + id, revision, 1500);
  useEffect(() => {
    if (data?.status === 'completed' || data?.status === 'failed') onSettled();
  }, [id, data?.status, onSettled]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return null;
  if (data.status === 'failed')
    return (
      <div className="panel">
        <Empty title="Evaluation needs a retry">
          <ErrorBox error={data.error ?? 'Provider validation failed'} />
          <p>
            Invalid or incomplete model output has no score. Use Re-evaluate to create a new run.
          </p>
        </Empty>
      </div>
    );
  if (data.status !== 'completed')
    return (
      <div className="panel">
        <Empty title={data.status === 'queued' ? 'Evaluation queued' : 'Reading the conversation…'}>
          <Loader2 className="spin" />
          <p>Validating rubric choices and evidence before calculating a score.</p>
          <Status value={data.status} />
        </Empty>
      </div>
    );
  return (
    <div>
      <div className="report-toolbar">
        <span>
          <Status value="completed" /> {fmtDate(data.finished_at)}
        </span>
        <button
          className="text-button"
          onClick={() =>
            downloadJSON(data, `${conversation.external_id}-v${checklist.version}-evaluation.json`)
          }
        >
          <Download size={14} />
          Export JSON
        </button>
      </div>
      <EvaluationCards
        run={data}
        checklist={data.checklist ?? checklist}
        conversation={conversation}
        onHighlight={onHighlight}
        onRefresh={() => {
          reload();
          refresh();
        }}
      />
    </div>
  );
}
export default function Detail() {
  const { id } = useParams();
  return <DetailContent key={id} id={id!} />;
}
function DetailContent({ id }: { id: string }) {
  const { revision, refresh, config } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [chosenVersion, setVersion] = useState(''),
    [highlighted, setHighlighted] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const notify = useNotify();
  const conv = useApi<Conversation>('/conversations/' + id, revision);
  const versions = useApi<Checklist[]>('/checklists', revision);
  const history = useApi<Run[]>('/conversations/' + id + '/evaluations', revision, 2000);
  const requestedRun = history.data?.find((r) => r.id === params.get('run'));
  const versionId =
    chosenVersion ||
    requestedRun?.checklist_version_id ||
    history.data?.[0]?.checklist_version_id ||
    versions.data?.[0]?.id;
  const checklist = versions.data?.find((v) => v.id === versionId);
  const run =
    requestedRun?.checklist_version_id === versionId
      ? requestedRun
      : history.data?.find((r) => r.checklist_version_id === versionId);
  async function evaluate() {
    if (!config?.llm_configured) {
      notify('Add GEMINI_API_KEY to the backend .env and restart the server.', true);
      return;
    }
    setBusy(true);
    try {
      const next = await post<Run>('/evaluations', {
        conversation_id: id,
        checklist_version_id: versionId,
      });
      setParams({ run: next.id });
      history.reload();
      refresh();
      notify('Evaluation queued. This creates a new auditable run.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (conv.loading || versions.loading) return <Loading />;
  if (conv.error || !conv.data)
    return <ErrorBox error={conv.error || 'Conversation not found'} retry={conv.reload} />;
  const conversation = conv.data;
  return (
    <div className="page detail-page">
      <Link className="back-link" to="/conversations">
        <ArrowLeft size={15} />
        All conversations
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONVERSATION REPORT</div>
          <h1>{conversation.external_id}</h1>
          <div className="detail-meta">
            <span className={`language ${conversation.language.toLowerCase()}`}>
              {conversation.language}
            </span>
            <span>{conversation.channel === 'voice call' ? 'Voice call' : 'Agent chat'}</span>
            <span>{conversation.group_id}</span>
            <span>{run ? <Status value={run.status} /> : <Status value="pending" />}</span>
          </div>
        </div>
        <Link className="btn secondary" to={`/compare?conversation=${id}`}>
          <GitCompareArrows size={16} />
          Compare versions
        </Link>
      </div>
      {conversation.group_id === 'SYNTHETIC_DEMO' && (
        <div className="notice synthetic-notice">
          SYNTHETIC DEMO · This is an example conversation, not an organizer-provided or real
          customer interaction.
        </div>
      )}
      <section className="panel evaluation-control">
        <div>
          <FileCheck2 size={19} />
          <label>
            Checklist version
            <select
              aria-label="Evaluation checklist version"
              value={versionId ?? ''}
              onChange={(e) => {
                setVersion(e.target.value);
                setParams({});
              }}
            >
              {versions.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} · {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          {history.data?.some((r) => r.checklist_version_id === versionId) && (
            <label>
              Evaluation history
              <select
                aria-label="Evaluation history"
                value={run?.id ?? ''}
                onChange={(e) => setParams({ run: e.target.value })}
              >
                {history.data
                  .filter((r) => r.checklist_version_id === versionId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {fmtDate(r.created_at)} · {r.status} · {r.final?.score ?? '—'}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <button
            className="btn primary"
            disabled={busy || !checklist || ['queued', 'processing'].includes(run?.status ?? '')}
            onClick={() => void evaluate()}
          >
            {busy ? <Loader2 size={16} className="spin" /> : <Play size={15} />}
            {busy ? 'Queueing…' : run ? 'Re-evaluate' : 'Run evaluation'}
          </button>
        </div>
      </section>
      {history.error && <ErrorBox error={history.error} retry={history.reload} />}
      <div className="detail-split">
        <Transcript conversation={conversation} highlighted={highlighted} />
        <div className="report-column">
          {checklist && run ? (
            <Report
              id={run.id}
              conversation={conversation}
              checklist={checklist}
              onHighlight={setHighlighted}
              onSettled={history.reload}
            />
          ) : (
            <section className="panel">
              <Empty title="Not evaluated under this version">
                <p>
                  Select a checklist and run an evaluation to see criterion scores, exact evidence,
                  and a weighted total.
                </p>
                {!config?.llm_configured && (
                  <p className="setup-message">
                    Live evaluation requires GEMINI_API_KEY in the backend .env.
                  </p>
                )}
                <button
                  className="btn primary"
                  disabled={busy || !checklist}
                  onClick={() => void evaluate()}
                >
                  <Play size={15} />
                  Run evaluation
                </button>
              </Empty>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
