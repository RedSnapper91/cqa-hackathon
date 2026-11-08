import { useEffect, useRef, useState } from 'react';
import { Headphones, ExternalLink, MessageSquare, Shield } from 'lucide-react';
import type { Conversation } from '../lib/types';
export default function Transcript({
  conversation,
  highlighted,
}: {
  conversation: Conversation;
  highlighted: string[];
}) {
  const nodes = useRef<Record<string, HTMLDivElement | null>>({}),
    [audioError, setAudioError] = useState(false);
  useEffect(() => {
    if (highlighted[0]) {
      nodes.current[highlighted[0]]?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      nodes.current[highlighted[0]]?.focus({ preventScroll: true });
    }
  }, [highlighted]);
  return (
    <section className="panel transcript-panel">
      <div className="panel-heading">
        <div>
          <h3>
            <MessageSquare size={17} />
            Original transcript
          </h3>
          <p>{conversation.messages.length} messages · timestamps preserved</p>
        </div>
        <span className={`language ${conversation.language.toLowerCase()}`}>
          {conversation.language}
        </span>
      </div>
      {conversation.channel === 'voice call' && (
        <div className="audio-block">
          <div>
            <Headphones size={17} />
            <strong>Call recording</strong>
            {conversation.audio_url && (
              <a href={conversation.audio_url} target="_blank" rel="noreferrer">
                Open recording <ExternalLink size={13} />
              </a>
            )}
          </div>
          {conversation.audio_url ? (
            <audio
              key={conversation.id}
              controls
              preload="none"
              aria-label="Call recording player"
              src={conversation.audio_url}
              onError={() => setAudioError(true)}
            />
          ) : (
            <p>Recording link not supplied.</p>
          )}
          <small>
            {audioError
              ? 'Recording cannot be played here. Use Open recording if you have access.'
              : 'Original ISO timestamps shown. Recording origin is unknown; no exact seek alignment is assumed.'}
          </small>
          {conversation.group_id === 'SYNTHETIC_DEMO' && (
            <small>
              Synthetic transcript; its example recording URL is intentionally unavailable.
            </small>
          )}
        </div>
      )}
      <div className="transcript-messages">
        {conversation.messages.map((m) => (
          <div
            key={m.id}
            id={m.id}
            ref={(node) => {
              nodes.current[m.id] = node;
            }}
            tabIndex={-1}
            data-message-id={m.id}
            className={`message ${m.speaker} ${highlighted.includes(m.id) ? 'highlighted' : ''}`}
          >
            <div className="message-meta">
              <span>
                {m.speaker === 'system' ? <Shield size={11} /> : null}
                {m.speaker === 'operator'
                  ? 'Operator'
                  : m.speaker === 'client'
                    ? 'Client'
                    : m.speaker === 'bot'
                      ? 'Bot · context'
                      : 'System · context'}
              </span>
              <time>{m.timestamp}</time>
              <small>#{m.ordinal + 1}</small>
            </div>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      <div className="transcript-foot">
        <Shield size={13} />
        Operator behavior is evaluated. Bot and system events provide context.
      </div>
    </section>
  );
}
