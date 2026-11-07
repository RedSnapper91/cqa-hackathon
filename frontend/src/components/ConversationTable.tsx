import { Link } from 'react-router-dom';
import { ArrowUpRight, Headphones, MessageSquare, AlertTriangle } from 'lucide-react';
import type { ConversationRow } from '../lib/types';
import { fmtDate } from '../lib/api';
import { Score, Status } from './ui';
export default function ConversationTable({
  rows,
  selected,
  onSelect,
}: {
  rows: ConversationRow[];
  selected?: Set<string>;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {onSelect && <th className="check-cell">Select</th>}
            <th>Conversation</th>
            <th>Language</th>
            <th>Channel</th>
            <th>Checklist</th>
            <th>Status</th>
            <th>Final score</th>
            <th>Last evaluated</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              {onSelect && (
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.external_id}`}
                    checked={selected?.has(c.id) ?? false}
                    onChange={() => onSelect(c.id)}
                  />
                </td>
              )}
              <td>
                <Link className="conversation-link" to={`/conversations/${c.id}`}>
                  <span className={`table-icon ${c.channel === 'voice call' ? 'voice' : ''}`}>
                    {c.channel === 'voice call' ? (
                      <Headphones size={17} />
                    ) : (
                      <MessageSquare size={17} />
                    )}
                  </span>
                  <span>
                    <strong>{c.external_id}</strong>
                    <small>
                      {c.group_id} · {c.message_count} messages
                    </small>
                  </span>
                </Link>
              </td>
              <td>
                <span className={`language ${c.language.toLowerCase()}`}>{c.language}</span>
              </td>
              <td className="muted">{c.channel === 'voice call' ? 'Voice call' : 'Agent chat'}</td>
              <td>
                {c.latest_evaluation ? (
                  <span className="version-tag">
                    v
                    {c.latest_evaluation.checklist_number ??
                      (c.latest_evaluation.checklist_version_id === 'v1' ? 1 : '?')}
                  </span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <Status value={c.status} />
              </td>
              <td>
                <div className="score-cell">
                  <Score value={c.score} small />
                  {c.gross_violation && (
                    <AlertTriangle
                      size={16}
                      className="danger-text"
                      aria-label="Serious violation"
                    />
                  )}
                </div>
              </td>
              <td className="muted nowrap">{fmtDate(c.latest_evaluation?.finished_at)}</td>
              <td>
                <Link
                  className="icon-link"
                  aria-label={`Open ${c.external_id}`}
                  to={`/conversations/${c.id}`}
                >
                  <ArrowUpRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
