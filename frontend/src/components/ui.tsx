import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X, Inbox } from 'lucide-react';
export const NotifyContext = createContext<(message: string, error?: boolean) => void>(() => {});
export function useNotify() {
  return useContext(NotifyContext);
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.error ? 10000 : 5500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  function notify(message: string, error = false) {
    setToast({ message, error });
  }
  return (
    <NotifyContext.Provider value={notify}>
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <X size={18} />
          </button>
        </div>
      )}
    </NotifyContext.Provider>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value}`}>
      {['processing', 'queued'].includes(value) && <Loader2 size={12} className="spin" />}
      <i />
      {value.replaceAll('_', ' ')}
    </span>
  );
}
export function Score({
  value,
  small = false,
}: {
  value: string | null | undefined;
  small?: boolean;
}) {
  return (
    <span
      className={`score ${small ? 'small' : ''} ${value != null ? (Number(value) >= 85 ? 'good' : Number(value) >= 60 ? 'mid' : 'low') : ''}`}
    >
      {value ?? '—'}
      {!small && value != null && <small>/ 100</small>}
    </span>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={26} />
      </div>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <Loader2 className="spin" size={24} />
      <p>Loading workspace…</p>
    </div>
  );
}
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="notice danger" role="alert">
      <AlertCircle size={18} />
      <span>{error}</span>
      {retry && (
        <button className="btn subtle" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button,input,select,textarea')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Tab') {
            const nodes = Array.from(
              ref.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]',
              ) ?? [],
            );
            const first = nodes[0],
              last = nodes.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
