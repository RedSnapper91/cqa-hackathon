import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowRight,
  CheckCheck,
  MessagesSquare,
  Clock3,
  ShieldAlert,
  Layers3,
  Sparkles,
  ArrowUpRight,
  ListChecks,
  Scale,
} from 'lucide-react';
import { useWorkspace } from '../App';
import { useApi } from '../lib/useApi';
import type { ConversationRow, DashboardData, Page } from '../lib/types';
import { ErrorBox, Loading } from '../components/ui';
import ImportDialog from '../components/ImportDialog';
import ConversationTable from '../components/ConversationTable';
import BatchPanel from '../components/BatchPanel';
export default function Dashboard() {
  const { config, revision, refresh } = useWorkspace();
  const { data, error, loading, reload } = useApi<DashboardData>('/dashboard', revision, 3000);
  const conversations = useApi<Page<ConversationRow>>('/conversations?size=5', revision, 3000);
  const [importing, setImporting] = useState(false);
  if (loading) return <Loading />;
  if (error || !data)
    return <ErrorBox error={error || 'Unable to load dashboard'} retry={reload} />;
  const metrics = [
    {
      title: 'Imported conversations',
      value: data.imported,
      sub: 'Across all dataset groups',
      icon: MessagesSquare,
      color: 'green',
    },
    {
      title: 'Evaluated',
      value: data.evaluated,
      sub: `${data.imported ? Math.round((100 * data.evaluated) / data.imported) : 0}% of imported conversations`,
      icon: CheckCheck,
      color: 'blue',
    },
    {
      title: 'Awaiting evaluation',
      value: data.pending + data.processing,
      sub: `${data.processing} in progress · ${data.failed} failed`,
      icon: Clock3,
      color: 'amber',
    },
    {
      title: 'Needs attention',
      value: data.flagged + data.open_appeals,
      sub: `${data.flagged} flagged · ${data.open_appeals} open appeals`,
      icon: ShieldAlert,
      color: 'rose',
    },
  ];
  const languageCount = Object.values(data.languages).reduce((a, b) => a + b, 0);
  const ru = languageCount ? (data.languages.RU / languageCount) * 100 : 0,
    kz = languageCount ? (data.languages.KZ / languageCount) * 100 : 0;
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONVERSATION QUALITY ANALYTICS</div>
          <h1>
            Your quality overview<span className="heading-dot">.</span>
          </h1>
          <p>A clearer view of every conversation. A reason behind every score.</p>
        </div>
        <button className="btn primary" onClick={() => setImporting(true)}>
          <ArrowDownToLine size={16} />
          Import dataset
        </button>
      </div>
      <div className="overview-banner">
        <div>
          <span className="banner-label">
            <span className="pulse-dot" /> QUALITY, WITH CONTEXT
          </span>
          <h2>
            Better conversations start
            <br />
            with a closer look.
          </h2>
          <p>
            Evaluate in three languages. Follow the evidence.
            <br />
            Give every operator a fair review.
          </p>
          <Link to="/conversations" className="banner-link">
            Explore conversations <ArrowRight size={17} />
          </Link>
        </div>
        <div className="banner-visual" aria-hidden="true">
          <div className="visual-ring ring-one" />
          <div className="visual-ring ring-two" />
          <div className="visual-ring ring-three" />
          <div className="floating-card one">
            <CheckCheck size={19} />
            <span>
              Evidence anchored<small>Original messages, always</small>
            </span>
            <span className="tiny-bars">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="floating-card two">
            <div className="language-stack">
              <b>RU</b>
              <b>KZ</b>
              <b>EN</b>
            </div>
            <span>
              Three languages.<small>One quality standard.</small>
            </span>
          </div>
          <div className="visual-star">✳</div>
        </div>
      </div>
      <div className="metrics-grid">
        {metrics.map((m) => (
          <div className="metric-card" key={m.title}>
            <div className="metric-label">
              {m.title}
              <span className={`metric-icon ${m.color}`}>
                <m.icon size={18} />
              </span>
            </div>
            <div className="metric-number">{m.value.toLocaleString()}</div>
            <p>{m.sub}</p>
          </div>
        ))}
      </div>
      <div className="dashboard-middle">
        <section className="panel readiness">
          <div className="panel-heading">
            <div>
              <h3>Evaluation workspace</h3>
              <p>Configured rules. Deterministic results.</p>
            </div>
            <Layers3 size={19} className="muted" />
          </div>
          <div className="readiness-row">
            <span className="setup-icon">
              <Sparkles size={18} />
            </span>
            <div>
              <strong>{config?.model ?? 'Gemini'}</strong>
              <small>
                {config?.llm_configured
                  ? 'Ready to evaluate using the configured provider'
                  : 'Add GEMINI_API_KEY in .env to enable live evaluation'}
              </small>
            </div>
            <span className={`status ${config?.llm_configured ? 'completed' : 'pending'}`}>
              {config?.llm_configured ? 'Connected' : 'Setup needed'}
            </span>
          </div>
          <div className="workspace-actions">
            <Link to="/checklists">
              <ListChecks size={18} />
              <span>
                Configure checklists<small>Weights, scales & immutable versions</small>
              </span>
              <ArrowUpRight size={17} />
            </Link>
            <Link to="/appeals">
              <Scale size={18} />
              <span>
                Review appeals
                <small>
                  {data.reviewed} reviewed · {data.open_appeals} awaiting decision
                </small>
              </span>
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>
        <section className="panel language-panel">
          <div className="panel-heading">
            <div>
              <h3>Conversation mix</h3>
              <p>Actual imported dataset distribution.</p>
            </div>
            <span className="eyebrow">RU / KZ / EN</span>
          </div>
          <div className="language-content">
            <div
              className="donut"
              style={{
                background: languageCount
                  ? `conic-gradient(#237d63 0% ${ru}%,#9fc4b2 ${ru}% ${ru + kz}%,#d5ab62 ${ru + kz}% 100%)`
                  : '#e9eeeb',
              }}
            >
              <div>
                <strong>{languageCount}</strong>
                <small>conversations</small>
              </div>
            </div>
            <div className="language-legend">
              {[
                ['RU', 'Russian'],
                ['KZ', 'Kazakh'],
                ['EN', 'English'],
              ].map(([code, label]) => (
                <div key={code}>
                  <span className={`legend-dot ${code.toLowerCase()}`} />
                  <span>{label}</span>
                  <strong>{data.languages[code]}</strong>
                </div>
              ))}
              <p>
                {data.channels['agent chat']} text chats <span>·</span>{' '}
                {data.channels['voice call']} voice calls
              </p>
            </div>
          </div>
        </section>
      </div>
      <BatchPanel />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>
              Conversation library <span className="count-tag">{data.imported}</span>
            </h3>
            <p>Open a transcript to evaluate, inspect evidence, or start a review.</p>
          </div>
          <Link className="text-link" to="/conversations">
            View all conversations <ArrowRight size={15} />
          </Link>
        </div>
        {conversations.data?.items.length ? (
          <ConversationTable rows={conversations.data.items} />
        ) : (
          <div className="library-empty">
            <MessagesSquare size={30} />
            <div>
              <h3>Your first conversation starts here</h3>
              <p>Import DEV, upload JSON, or load our multilingual synthetic demo.</p>
            </div>
            <button className="btn secondary" onClick={() => setImporting(true)}>
              Import conversations <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>
      <div className="method-note">
        <ShieldAlert size={15} />
        <span>
          Transparent scoring: N/A redistributes weight. Serious violations are flagged separately.
          Human decisions preserve the original assessment.
        </span>
      </div>
      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={refresh} />}
    </div>
  );
}
