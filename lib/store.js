// Tiny JSON-file store. Good enough for a hackathon demo, trivially swappable
// for Dataverse tables when the UI moves into Dynamics 365.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CHECKLIST } from './default-checklist.js';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.resolve(PROJECT_DIR, process.env.CQA_DATA_DIR || 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const uid = (prefix) => `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
export const now = () => new Date().toISOString();

let db = null;
let saveTimer = null;

function blank() {
  return {
    checklists: [],
    active_checklist_id: null,
    conversations: {},
    datasets: {},
    evaluations: [],
    appeals: [],
  };
}

export function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = { ...blank(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } else {
    db = blank();
  }
  if (!db.checklists.length) {
    const cl = {
      ...structuredClone(DEFAULT_CHECKLIST),
      id: uid('cl'),
      family: 'default',
      version: 1,
      created_at: now(),
    };
    db.checklists.push(cl);
    db.active_checklist_id = cl.id;
    saveNow();
  }
  return db;
}

export function get() {
  return db || load();
}

export function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

/** Debounced save — batches of evaluations write once. */
export function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, 300);
}

export function dataDir() {
  return DATA_DIR;
}
