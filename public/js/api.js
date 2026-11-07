// Thin API client. apiBase lets the same UI run as a Dynamics 365 web resource.
const base = () => (window.CQA_CONFIG && window.CQA_CONFIG.apiBase) || '';

async function call(method, path, body) {
  const res = await fetch(base() + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  health: () => call('GET', '/api/health'),
  stats: () => call('GET', '/api/stats'),
  checklists: () => call('GET', '/api/checklists'),
  saveChecklist: (body) => call('POST', '/api/checklists', body),
  activateChecklist: (id) => call('POST', `/api/checklists/${id}/activate`),
  conversations: () => call('GET', '/api/conversations'),
  conversation: (id) => call('GET', `/api/conversations/${encodeURIComponent(id)}`),
  loadGroup: (group_id) => call('POST', '/api/datasets/load', { group_id }),
  upload: (body) => call('POST', '/api/conversations/upload', body),
  audio: (id) => call('GET', `/api/audio/${encodeURIComponent(id)}`),
  evaluate: (body) => call('POST', '/api/evaluate', body),
  job: (id) => call('GET', `/api/jobs/${id}`),
  appeals: () => call('GET', '/api/appeals'),
  appeal: (evaluationId, body) => call('POST', `/api/evaluations/${evaluationId}/appeals`, body),
  decide: (appealId, body) => call('POST', `/api/appeals/${appealId}/decision`, body),
  exportUrl: () => base() + '/api/export.csv',
};
