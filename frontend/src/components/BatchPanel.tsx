import { Link } from 'react-router-dom';
import { useState } from 'react';
import { post } from '../lib/api';
import { useApi } from '../lib/useApi';
import type { Batch } from '../lib/types';
import { Status, useNotify } from './ui';
export default function BatchPanel() {
  const { data, reload } = useApi<Batch[]>('/batches', 0, 2000);
  const [expanded, setExpanded] = useState('');
  const notify = useNotify();
  if (!data?.length) return null;
  return (
    <section className="panel batch-panel">
      <div className="panel-heading">
        <div>
          <h3>Batch processing</h3>
          <p>Persisted progress across all conversations in each job.</p>
        </div>
        <span className="eyebrow">LATEST JOBS</span>
      </div>
      {data.slice(0, 3).map((b) => (
        <div className="batch-job" key={b.id}>
          <div className="batch-top">
            <button
              className="text-button"
              onClick={() => setExpanded(expanded === b.id ? '' : b.id)}
            >
              {b.total} conversations{' '}
              <span className="muted">
                · {b.finished}/{b.total} processed
              </span>
            </button>
            <Status value={b.status} />
            {b.counts.failed > 0 && (
              <button
                className="btn subtle"
                onClick={() => {
                  post('/batches/' + b.id + '/retry')
                    .then(() => {
                      reload();
                      notify('Failed items queued as a new batch');
                    })
                    .catch((e) => notify(e.message, true));
                }}
              >
                Retry {b.counts.failed} failed
              </button>
            )}
          </div>
          <progress value={b.finished} max={b.total} aria-label="Batch evaluation progress" />
          <div className="batch-counts">
            <span>{b.counts.completed} completed</span>
            <span>{b.counts.processing} processing</span>
            <span>{b.counts.queued} queued</span>
            <span className={b.counts.failed ? 'danger-text' : ''}>{b.counts.failed} failed</span>
          </div>
          {expanded === b.id && (
            <div className="batch-items">
              {b.items.map((i) => (
                <div key={i.id}>
                  <Link to={`/conversations/${i.conversation_id}?run=${i.id}`}>
                    {i.external_id}
                  </Link>
                  <Status value={i.status} />
                  {i.error && <small className="danger-text">{i.error}</small>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
