import { useState } from 'react';
import { Search, Upload, Play, ChevronLeft, ChevronRight, Filter, CheckSquare } from 'lucide-react';
import { useWorkspace } from '../App';
import { useApi } from '../lib/useApi';
import { api, post } from '../lib/api';
import type { Batch, Checklist, ConversationRow, Dataset, Page } from '../lib/types';
import { ErrorBox, Loading, Empty, useNotify } from '../components/ui';
import ImportDialog from '../components/ImportDialog';
import ConversationTable from '../components/ConversationTable';
import BatchPanel from '../components/BatchPanel';
export default function Conversations() {
  const { revision, refresh, config } = useWorkspace();
  const [importing, setImporting] = useState(false),
    [search, setSearch] = useState(''),
    [language, setLanguage] = useState(''),
    [group, setGroup] = useState(''),
    [channel, setChannel] = useState(''),
    [status, setStatus] = useState(''),
    [flag, setFlag] = useState(''),
    [min, setMin] = useState(''),
    [max, setMax] = useState(''),
    [version, setVersion] = useState(''),
    [filterVersion, setFilterVersion] = useState(''),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Set<string>>(new Set());
  const notify = useNotify();
  const versions = useApi<Checklist[]>('/checklists', revision);
  const groups = useApi<Dataset[]>('/datasets', revision);
  const params = new URLSearchParams({ page: String(page), size: '15', search });
  for (const [key, value] of Object.entries({
    language,
    group_id: group,
    channel,
    status,
    checklist_version_id: filterVersion,
    flagged: flag,
    min_score: min,
    max_score: max,
  })) {
    if (value) params.set(key, value);
  }
  const { data, error, loading, reload } = useApi<Page<ConversationRow>>(
    '/conversations?' + params,
    revision,
    3000,
  );
  function change(setter: (s: string) => void, value: string) {
    setter(value);
    setPage(1);
    setSelected(new Set());
  }
  async function evaluate(all = false) {
    if (!config?.llm_configured) {
      notify(
        'Add GEMINI_API_KEY to the backend .env and restart the server to enable evaluation.',
        true,
      );
      return;
    }
    setBusy(true);
    try {
      let ids = [...selected];
      if (all) {
        ids = [];
        const query = new URLSearchParams(params);
        query.set('size', '100');
        let current = 1,
          total = 1;
        do {
          query.set('page', String(current++));
          const r = await api<Page<ConversationRow>>('/conversations?' + query);
          ids.push(...r.items.map((c) => c.id));
          total = r.total;
        } while (ids.length < total);
      }
      if (!ids.length) throw new Error('Select conversations or use Evaluate all matching.');
      const b = await post<Batch>('/evaluations/batch', {
        conversation_ids: ids,
        checklist_version_id: version || versions.data?.[0].id,
      });
      notify(`${b.total} conversations queued`);
      setSelected(new Set());
      refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CONVERSATION LIBRARY</div>
          <h1>
            Conversations<span className="heading-dot">.</span>
          </h1>
          <p>Every language. Every channel. The full story behind the score.</p>
        </div>
        <button className="btn primary" onClick={() => setImporting(true)}>
          <Upload size={16} />
          Import dataset
        </button>
      </div>
      <section className="panel">
        <div className="filters">
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="Search conversations"
              placeholder="Search ID or transcript…"
              value={search}
              onChange={(e) => change(setSearch, e.target.value)}
            />
          </label>
          <select
            aria-label="Filter dataset"
            value={group}
            onChange={(e) => change(setGroup, e.target.value)}
          >
            <option value="">All datasets</option>
            {groups.data?.map((g) => (
              <option key={g.id}>{g.id}</option>
            ))}
          </select>
          <select
            aria-label="Filter language"
            value={language}
            onChange={(e) => change(setLanguage, e.target.value)}
          >
            <option value="">All languages</option>
            {['RU', 'KZ', 'EN'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <select
            aria-label="Filter channel"
            value={channel}
            onChange={(e) => change(setChannel, e.target.value)}
          >
            <option value="">All channels</option>
            <option value="agent chat">Agent chat</option>
            <option value="voice call">Voice call</option>
          </select>
          <select
            aria-label="Filter status"
            value={status}
            onChange={(e) => change(setStatus, e.target.value)}
          >
            <option value="">All statuses</option>
            {['pending', 'queued', 'processing', 'completed', 'failed'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <details className="advanced-filters">
          <summary>
            <Filter size={14} />
            More filters
          </summary>
          <div className="filters">
            <select
              aria-label="Filter checklist version"
              value={filterVersion}
              onChange={(e) => change(setFilterVersion, e.target.value)}
            >
              <option value="">Latest run · any version</option>
              {versions.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} · {v.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter serious violations"
              value={flag}
              onChange={(e) => change(setFlag, e.target.value)}
            >
              <option value="">All flags</option>
              <option value="true">Serious violation</option>
              <option value="false">No serious violation</option>
            </select>
            <input
              type="number"
              min="0"
              max="100"
              placeholder="Min score"
              aria-label="Minimum score"
              value={min}
              onChange={(e) => change(setMin, e.target.value)}
            />
            <input
              type="number"
              min="0"
              max="100"
              placeholder="Max score"
              aria-label="Maximum score"
              value={max}
              onChange={(e) => change(setMax, e.target.value)}
            />
          </div>
        </details>
        <div className="table-toolbar">
          <span>
            <CheckSquare size={16} />
            {selected.size ? `${selected.size} selected` : `${data?.total ?? 0} conversations`}
          </span>
          <div>
            <select
              aria-label="Batch checklist version"
              value={version || versions.data?.[0]?.id || ''}
              onChange={(e) => setVersion(e.target.value)}
            >
              {versions.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  Evaluate with v{v.version}
                </option>
              ))}
            </select>
            <button
              className="btn secondary"
              disabled={busy || !selected.size}
              onClick={() => void evaluate()}
            >
              <Play size={14} />
              Evaluate selected
            </button>
            <button
              className="btn primary"
              disabled={busy || !data?.total}
              onClick={() => void evaluate(true)}
            >
              {busy ? 'Queueing…' : 'Evaluate all matching'}
            </button>
          </div>
        </div>
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.items.length ? (
          <ConversationTable
            rows={data.items}
            selected={selected}
            onSelect={(id) =>
              setSelected((previous) => {
                const next = new Set(previous);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
          />
        ) : (
          <Empty title="No conversations found">
            <p>Adjust your filters or import a dataset to get started.</p>
            <button className="btn secondary" onClick={() => setImporting(true)}>
              Import conversations
            </button>
          </Empty>
        )}
        <div className="pagination">
          <span>
            {data?.total ?? 0} results · page {page} of{' '}
            {Math.max(1, Math.ceil((data?.total ?? 0) / 15))}
          </span>
          <div>
            <button
              aria-label="Previous page"
              className="icon-btn"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              aria-label="Next page"
              className="icon-btn"
              disabled={page * 15 >= (data?.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
      {!config?.llm_configured && (
        <div className="notice">
          <span>
            Live evaluation needs a server-side Gemini API key. Import, transcripts, and checklist
            editing work now.
          </span>
        </div>
      )}
      {config?.llm_configured && !config.external_call_processing_allowed && (
        <div className="notice">
          For batches, choose Agent chat. External processing of voice transcripts is disabled until
          authorized.
        </div>
      )}
      <BatchPanel />
      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={refresh} />}
    </div>
  );
}
