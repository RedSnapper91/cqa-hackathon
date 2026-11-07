import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useWorkspace } from '../App';
import { useApi } from '../lib/useApi';
import { fmtDate } from '../lib/api';
import type { Page, Run } from '../lib/types';
import { Empty, ErrorBox, Loading, Score, Status } from '../components/ui';
import BatchPanel from '../components/BatchPanel';
export default function Evaluations() {
  const { revision } = useWorkspace();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Page<Run>>(
    '/evaluations?page=' + page,
    revision,
    2000,
  );
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">A COMPLETE AUDIT TRAIL</div>
          <h1>
            Evaluations<span className="heading-dot">.</span>
          </h1>
          <p>
            Every run, checklist version, provider, and final result. Earlier assessments stay
            intact.
          </p>
        </div>
      </div>
      <BatchPanel />
      <section className="panel">
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty title="No evaluation runs yet">
            <p>Import conversations, choose a checklist, and start an evaluation.</p>
            <Link className="btn secondary" to="/conversations">
              Open conversations
            </Link>
          </Empty>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Conversation</th>
                    <th>Provider / model</th>
                    <th>Checklist</th>
                    <th>Status</th>
                    <th>Original</th>
                    <th>Final</th>
                    <th>Created</th>
                    <th>Report</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link
                          className="text-link"
                          to={`/conversations/${r.conversation_id}?run=${r.id}`}
                        >
                          {r.external_id}
                        </Link>
                      </td>
                      <td>
                        <strong>{r.provider}</strong>
                        <small className="block muted">{r.model}</small>
                      </td>
                      <td>
                        <code>
                          {r.checklist_version_id === 'v1'
                            ? 'v1'
                            : r.checklist_version_id.slice(0, 15) + '…'}
                        </code>
                      </td>
                      <td>
                        <Status value={r.status} />
                        {r.error && <small className="error-inline">{r.error}</small>}
                      </td>
                      <td>
                        <Score value={r.original?.score} small />
                      </td>
                      <td>
                        <Score value={r.final?.score} small />
                      </td>
                      <td className="muted">{fmtDate(r.created_at)}</td>
                      <td>
                        <Link
                          aria-label={`Open evaluation ${r.external_id}`}
                          className="icon-link"
                          to={`/conversations/${r.conversation_id}?run=${r.id}`}
                        >
                          <ArrowUpRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {data.total} runs · page {page}
              </span>
              <div>
                <button
                  className="icon-btn"
                  aria-label="Previous evaluations page"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="icon-btn"
                  aria-label="Next evaluations page"
                  disabled={page * 25 >= data.total}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
