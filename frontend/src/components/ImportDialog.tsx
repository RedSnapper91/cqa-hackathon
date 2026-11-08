import { useState } from 'react';
import { Upload, Database, FileJson, ArrowRight } from 'lucide-react';
import { api, post } from '../lib/api';
import { Modal, ErrorBox, useNotify } from './ui';
export default function ImportDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [group, setGroup] = useState('DEV'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const notify = useNotify();
  async function perform(action: () => Promise<{ inserted: number; unchanged: number }>) {
    setBusy(true);
    setError('');
    try {
      const r = await action();
      notify(`Imported ${r.inserted} conversations · ${r.unchanged} already present`);
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Import conversations" onClose={onClose}>
      <p className="muted">
        Connect a dataset, upload organizer-format JSON, or explore the synthetic demo.
      </p>
      {error && <ErrorBox error={error} />}
      <div className="import-option">
        <Database size={22} />
        <div>
          <h3>Organizer dataset</h3>
          <p>
            The signed endpoint is stored securely on the backend. Enter DEV or the new control
            group.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(() => post('/datasets/import', { group_id: group }));
            }}
            className="inline-form"
          >
            <input
              aria-label="Dataset group ID"
              pattern="[A-Za-z0-9_-]{1,64}"
              required
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            />
            <button className="btn primary" disabled={busy}>
              Import group <ArrowRight size={15} />
            </button>
          </form>
        </div>
      </div>
      <div className="import-option">
        <FileJson size={22} />
        <div>
          <h3>Local JSON file</h3>
          <p>Original transcript messages and timestamps are preserved. Maximum 20 MB.</p>
          <input
            disabled={busy}
            aria-label="Upload dataset JSON"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const form = new FormData();
                form.append('file', file);
                void perform(() => api('/datasets/import-json', { method: 'POST', body: form }));
              }
            }}
          />
        </div>
      </div>
      <div className="import-option">
        <Upload size={22} />
        <div>
          <h3>Synthetic demo</h3>
          <p>
            10 clearly labeled examples in RU, KZ and EN, including a call transcript. No organizer
            or real customer data.
          </p>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => void perform(() => post('/datasets/demo'))}
          >
            Load synthetic demo
          </button>
        </div>
      </div>
      {busy && (
        <p role="status" className="muted">
          Importing…
        </p>
      )}
    </Modal>
  );
}
