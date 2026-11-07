// Organizer API adapter (server side → no CORS issues), normalisation, audio lookup.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The organizers' GET link carries a signature, so it is never committed:
// set CQA_API_URL or put {"api_url": "..."} into config.local.json (git-ignored).
function configuredApiUrl() {
  if (process.env.CQA_API_URL) return process.env.CQA_API_URL;
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'config.local.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).api_url || null;
  } catch {
    return null;
  }
}

export function apiUrl(groupId) {
  const base = configuredApiUrl();
  if (!base) throw new Error('Не задан адрес API организаторов: укажите CQA_API_URL или api_url в config.local.json (см. README)');
  const u = new URL(base);
  u.searchParams.set('group_id', groupId);
  return u.toString();
}

export async function fetchGroup(groupId) {
  const res = await fetch(apiUrl(groupId), { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`API организаторов вернул HTTP ${res.status}`);
  const body = await res.json();
  if (!body.isSuccess) throw new Error(body.error || 'API организаторов: isSuccess = false');
  const records = body?.data?.records || [];
  return { group_id: body?.data?.dataset_group_id || groupId, records };
}

const ROLE_ALIASES = {
  client: 'client', customer: 'client', user: 'client', клиент: 'client',
  operator: 'operator', agent: 'operator', оператор: 'operator',
  bot: 'bot', бот: 'bot', assistant: 'bot',
  system: 'system', система: 'system',
};

export function normalizeRecord(raw, groupId, source = 'api') {
  if (!raw || !raw.conversation_id) throw new Error('У записи нет conversation_id');
  let transcript = raw.transcript;
  if (typeof transcript === 'string') {
    try { transcript = JSON.parse(transcript); } catch { transcript = parseTextTranscript(transcript); }
  }
  if (!Array.isArray(transcript)) throw new Error(`${raw.conversation_id}: transcript не массив`);
  const lines = transcript.map((t, idx) => ({
    idx,
    timestamp: String(t.timestamp ?? ''),
    speaker: ROLE_ALIASES[String(t.speaker || '').toLowerCase()] || 'system',
    text: String(t.text ?? ''),
  }));
  const channel = raw.channel || (raw.audio_url ? 'voice call' : 'agent chat');
  const language = String(raw.language || guessLanguage(lines)).toUpperCase();
  attachAudioOffsets(lines);
  return {
    conversation_id: String(raw.conversation_id),
    channel,
    language,
    transcript: lines,
    audio_url: raw.audio_url || null,
    group_id: groupId,
    source,
    imported_at: new Date().toISOString(),
  };
}

function guessLanguage(lines) {
  const text = lines.map((l) => l.text).join(' ');
  if (/[әғқңөұүһі]/i.test(text)) return 'KZ';
  if (/[а-яё]/i.test(text)) return 'RU';
  return 'EN';
}

/** Parse "00:12 operator: text" / "[00:12] Оператор: text" pasted transcripts. */
export function parseTextTranscript(text) {
  const out = [];
  const re = /^\s*\[?([\d:.TZ+\-]+)?\]?\s*([A-Za-zА-Яа-яЁё]+)\s*[:\-—]\s*(.+)$/;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(re);
    if (m && ROLE_ALIASES[m[2].toLowerCase()]) {
      out.push({ timestamp: m[1] || '', speaker: m[2], text: m[3] });
    } else if (out.length) {
      out[out.length - 1].text += '\n' + line.trim();
    }
  }
  return out;
}

/** Seconds of a timestamp: MM:SS (chat) or ISO 8601 (call). */
export function tsSeconds(ts) {
  if (!ts) return null;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(ts)) {
    const p = ts.split(':').map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  }
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms / 1000;
}

/**
 * For calls: estimate the position of every line inside the audio recording.
 * Recording starts at "Запись ... запущены" and skips the paused intervals
 * ("приостановлены" → "возобновлены"), so only recorded time is accumulated.
 * For chats `t` is simply the MM:SS offset in seconds.
 */
function attachAudioOffsets(lines) {
  const secs = lines.map((l) => tsSeconds(l.timestamp));
  if (!lines.length || secs.some((s) => s === null) || !/T/.test(lines[0].timestamp)) {
    lines.forEach((l, i) => (l.t = secs[i]));
    return;
  }
  let recording = false;
  let offset = 0;
  let last = null;
  const startIdx = lines.findIndex((l) => l.speaker === 'system' && /(запущен|started)/i.test(l.text));
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const s = secs[i];
    if (i === startIdx || (startIdx === -1 && i === 0)) { recording = true; last = s; }
    if (recording && last !== null) { offset += Math.max(0, s - last); last = s; }
    l.t = recording || i > startIdx ? Math.round(offset * 10) / 10 : 0;
    if (l.speaker === 'system' && /(приостановлен|paused)/i.test(l.text)) recording = false;
    if (l.speaker === 'system' && /(возобновлен|resumed)/i.test(l.text)) { recording = true; last = s; }
  }
}

// ---- audio: audio_url returns a small HTML player; the real MP3 is a 1h SAS link ----
const audioCache = new Map();

export async function resolveAudio(audioUrl) {
  const hit = audioCache.get(audioUrl);
  if (hit && hit.expires > Date.now()) return hit.src;
  const res = await fetch(audioUrl, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  let src = audioUrl;
  if (type.includes('text/html')) {
    const html = await res.text();
    const m = html.match(/<source[^>]+src="([^"]+)"/i) || html.match(/<audio[^>]+src="([^"]+)"/i);
    if (!m) throw new Error('В странице плеера не найден источник аудио');
    src = m[1].replace(/&amp;/g, '&');
  }
  audioCache.set(audioUrl, { src, expires: Date.now() + 50 * 60 * 1000 });
  return src;
}
