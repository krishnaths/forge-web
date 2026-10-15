// Two-way sync with the Supabase mirror (supabase/migrations/0001_init.sql).
//
// Push is the phone's SyncEngine, unchanged: per table, every row with updatedAt above that
// table's watermark is upserted on its natural key; the watermark moves only after every chunk
// landed; undone sets go up as DELETEs from sync_tombstone. The keep_newer trigger drops any
// upsert older than the cloud row, so neither device can roll the other back.
//
// Pull is what the phone only does on "Restore": fetch rows changed recently and keep each one
// where this browser has no row for that key or an older one. It runs on open, on refocus and
// every few minutes, so phone edits show up here without a manual step.
//
// While signed in, an edit is pushed a few seconds later — effectively saved straight to Supabase
// when online, and queued in IndexedDB until the connection is back when not.

import { SUPABASE_KEY, SUPABASE_URL } from '../config.js';
import * as db from './db.js';
import { HABIT_LABELS } from './repo.js';

export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);

const STORE = 'forge_sync';
const PUSH_DELAY_MS = 3_000;
const PULL_EVERY_MS = 5 * 60_000;
// Devices' clocks disagree a little, and the phone may push hours after an edit made offline.
// Re-reading a day of overlap costs a few rows and means none are skipped.
const PULL_OVERLAP_MS = 24 * 3_600_000;

// ---------------------------------------------------------------- persisted state

function load() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; }
}
let state = load();
const listeners = new Set();
let busy = false;

function save(patch) {
  state = { ...state, ...patch };
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage blocked */ }
  emit();
}

const emit = () => listeners.forEach(fn => fn(status()));

export const status = () => ({
  configured,
  signedIn: Boolean(state.session),
  email: state.session?.email ?? null,
  lastSyncAt: state.lastSyncAt ?? null,
  lastError: state.lastError ?? null,
  busy,
  online: navigator.onLine,
});

export function onStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------- REST

class SupabaseError extends Error {
  constructor(code, message) { super(`HTTP ${code}: ${message}`); this.code = code; }
}

async function call(path, { method = 'GET', body, bearer, prefer } = {}) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/${path}`, {
    method, headers, body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 200);
    try {
      const o = JSON.parse(text);
      msg = o.error_description ?? o.msg ?? o.message ?? o.error ?? msg;
    } catch { /* not JSON */ }
    throw new SupabaseError(res.status, msg);
  }
  return text ? JSON.parse(text) : null;
}

const token = (grant, body) =>
  call(`auth/v1/token?grant_type=${grant}`, { method: 'POST', body });

const sessionFrom = (t, email) => ({
  userId: t.user.id,
  email: t.user.email ?? email,
  accessToken: t.access_token,
  refreshToken: t.refresh_token,
  expiresAt: Date.now() + t.expires_in * 1000,
});

/** A valid access token, refreshed a minute early. Null when signed out. */
async function session() {
  const s = state.session;
  if (!s) return null;
  if (Date.now() < s.expiresAt - 60_000) return s;
  try {
    const t = await token('refresh_token', { refresh_token: s.refreshToken });
    const next = { ...sessionFrom(t, s.email), email: s.email };
    save({ session: next });
    return next;
  } catch (e) {
    // The refresh token was revoked or the user deleted: the session is over.
    if (e.code >= 400 && e.code < 500) save({ session: null });
    throw e;
  }
}

async function selectSince(table, since, bearer) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = await call(
      `rest/v1/${table}?select=*&updated_at=gt.${since}&order=day&limit=1000&offset=${offset}`,
      { bearer },
    );
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// ---------------------------------------------------------------- wire shapes

const ts = ms => new Date(ms).toISOString();
const ms = s => Date.parse(s);
const num = v => (v == null ? null : Number(v));

/** Local row <-> Supabase row, per table, plus the on_conflict columns. */
const TABLES = {
  daily_log: {
    conflict: 'user_id,day',
    toRow: (r, u) => ({
      user_id: u, day: r.day, day_type: r.dayType, water_ml: r.waterMl, steps: r.steps,
      steps_source: r.stepsSource, meditated: r.meditated, updated_at: r.updatedAt,
    }),
    fromRow: r => ({
      day: r.day, dayType: r.day_type, waterMl: r.water_ml, steps: r.steps,
      stepsSource: r.steps_source, meditated: r.meditated, updatedAt: r.updated_at,
    }),
  },
  meal_log: {
    conflict: 'user_id,day,slot_key',
    toRow: (r, u) => ({
      user_id: u, day: r.day, slot_key: r.slotKey, slot_title: r.slotTitle, day_type: r.dayType,
      option_index: r.optionIndex, option_title: r.optionTitle, followed: r.followed,
      updated_at: r.updatedAt,
    }),
    fromRow: r => ({
      day: r.day, slotKey: r.slot_key, slotTitle: r.slot_title, dayType: r.day_type,
      optionIndex: r.option_index, optionTitle: r.option_title, followed: r.followed,
      updatedAt: r.updated_at,
    }),
  },
  habit_entry: {
    conflict: 'user_id,day,habit_index',
    toRow: (r, u) => ({
      user_id: u, day: r.day, habit_index: r.habitIndex,
      habit_label: HABIT_LABELS[r.habitIndex] ?? `habit ${r.habitIndex}`,
      done: r.done, updated_at: r.updatedAt,
    }),
    fromRow: r => ({ day: r.day, habitIndex: r.habit_index, done: r.done, updatedAt: r.updated_at }),
  },
  weight_entry: {
    conflict: 'user_id,day',
    toRow: (r, u) => ({ user_id: u, day: r.day, kg: r.kg, updated_at: r.updatedAt }),
    fromRow: r => ({ day: r.day, kg: num(r.kg), updatedAt: r.updated_at }),
  },
  measurement: {
    conflict: 'user_id,day',
    toRow: (r, u) => ({
      user_id: u, day: r.day, left_arm: r.leftArm, right_arm: r.rightArm,
      left_thigh: r.leftThigh, right_thigh: r.rightThigh, waist_top: r.waistTop,
      waist_middle: r.waistMiddle, waist_lower: r.waistLower, updated_at: r.updatedAt,
    }),
    fromRow: r => ({
      day: r.day, leftArm: num(r.left_arm), rightArm: num(r.right_arm),
      leftThigh: num(r.left_thigh), rightThigh: num(r.right_thigh), waistTop: num(r.waist_top),
      waistMiddle: num(r.waist_middle), waistLower: num(r.waist_lower), updatedAt: r.updated_at,
    }),
  },
  workout_session: {
    conflict: 'user_id,day',
    toRow: (r, u) => ({
      user_id: u, day: r.day, week: r.week, day_of_week: r.dayOfWeek, focus: r.focus,
      started_at: ts(r.startedAt), finished_at: r.finishedAt == null ? null : ts(r.finishedAt),
      notes: r.notes ?? '', updated_at: r.updatedAt,
    }),
    fromRow: r => ({
      day: r.day, week: r.week, dayOfWeek: r.day_of_week, focus: r.focus,
      startedAt: ms(r.started_at), finishedAt: r.finished_at ? ms(r.finished_at) : null,
      notes: r.notes ?? '', updatedAt: r.updated_at,
    }),
  },
  set_log: {
    conflict: 'user_id,day,exercise_name,set_index',
    toRow: (r, u) => ({
      user_id: u, day: r.day, exercise_name: r.exerciseName, set_index: r.setIndex, reps: r.reps,
      weight_kg: r.weightKg, target_weight_kg: r.targetWeightKg, target_reps: r.targetReps,
      sets_prescribed: r.setsPrescribed, completed_at: ts(r.completedAt), updated_at: r.updatedAt,
    }),
    fromRow: r => ({
      day: r.day, exerciseName: r.exercise_name, setIndex: r.set_index, reps: r.reps,
      weightKg: num(r.weight_kg), targetWeightKg: num(r.target_weight_kg),
      targetReps: r.target_reps, setsPrescribed: r.sets_prescribed,
      completedAt: ms(r.completed_at), updatedAt: r.updated_at,
    }),
  },
};

// ---------------------------------------------------------------- engine

// Pushes and pulls never interleave watermark writes.
let chain = Promise.resolve();
function exclusive(fn) {
  const run = chain.then(async () => {
    busy = true; emit();
    try { return await fn(); } finally { busy = false; emit(); }
  });
  chain = run.catch(() => {});
  return run;
}

const recordSuccess = () => save({ lastSyncAt: Date.now(), lastError: null });
const recordError = e => save({ lastError: e.message || String(e) });

/** -1 = never pushed, so rows stamped updatedAt 0 (the workbook history) still go up once. */
const watermark = t => state.wm?.[t] ?? -1;

async function pushLocked() {
  const s = await session();
  if (!s) return false;
  for (const [table, spec] of Object.entries(TABLES)) {
    const since = watermark(table);
    // Rows that arrived by pull are already in the cloud; only local edits go up.
    const rows = db.all(table).filter(r => r.updatedAt > since && !r._remote);
    if (!rows.length) continue;
    for (let i = 0; i < rows.length; i += 500) {
      await call(`rest/v1/${table}?on_conflict=${spec.conflict}`, {
        method: 'POST',
        bearer: s.accessToken,
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: rows.slice(i, i + 500).map(r => spec.toRow(r, s.userId)),
      });
    }
    save({ wm: { ...state.wm, [table]: Math.max(...rows.map(r => r.updatedAt)) } });
  }
  for (const t of db.all('sync_tombstone').sort((a, b) => a.id - b.id)) {
    if (t.tableName === 'set_log') {
      const q = new URLSearchParams({
        user_id: `eq.${s.userId}`, day: `eq.${t.day}`,
        exercise_name: `eq.${t.keyText}`, set_index: `eq.${t.keyInt}`,
      });
      await call(`rest/v1/set_log?${q}`, { method: 'DELETE', bearer: s.accessToken });
    }
    await db.write([['del', 'sync_tombstone', String(t.id)]]);
  }
  return true;
}

let applyingRemote = false;

/** Writes each remote row where this browser has none for that key, or an older one. */
async function pullLocked(full) {
  const s = await session();
  if (!s) return 0;
  const pending = new Set(db.all('sync_tombstone').map(t => `${t.day}|${t.keyText}|${t.keyInt}`));
  let written = 0;
  const pulled = { ...state.pulled };
  for (const [table, spec] of Object.entries(TABLES)) {
    const since = full || pulled[table] == null ? -1 : pulled[table] - PULL_OVERLAP_MS;
    const remote = await selectSince(table, since, s.accessToken);
    const ops = [];
    for (const r of remote) {
      const row = { ...spec.fromRow(r), _remote: true };
      const key = db.keyOf(table, row);
      if (table === 'set_log' && pending.has(key)) continue; // undone here, delete not sent yet
      const local = db.get(table, key);
      if (!local || local.updatedAt < row.updatedAt) ops.push(['put', table, row]);
    }
    applyingRemote = true;
    try { await db.write(ops); } finally { applyingRemote = false; }
    written += ops.length;
    if (remote.length) pulled[table] = Math.max(pulled[table] ?? -1, ...remote.map(r => r.updated_at));
  }
  save({ pulled });
  return written;
}

/** Upload local edits, then fetch remote ones. Returns rows written locally. */
export function syncNow() {
  return exclusive(async () => {
    try {
      if (!(await pushLocked())) return 0;
      const n = await pullLocked(false);
      recordSuccess();
      return n;
    } catch (e) {
      recordError(e);
      throw e;
    }
  });
}

/** Pulls the whole cloud copy, like the phone's Restore. */
export function restore() {
  return exclusive(async () => {
    try {
      if (!state.session) throw new Error('Sign in first');
      await pushLocked();
      const n = await pullLocked(true);
      recordSuccess();
      return n;
    } catch (e) {
      recordError(e);
      throw e;
    }
  });
}

export async function signIn(email, password) {
  if (!configured) throw new Error('Sync is not configured: fill in config.js');
  const t = await token('password', { email: email.trim(), password });
  // A different account must not inherit the previous one's watermarks.
  save({ session: sessionFrom(t, email.trim()), wm: {}, pulled: {}, lastError: null });
  return syncNow();
}

/** Signing out forgets everything, watermarks included: the next account starts from zero. */
export function signOut() {
  return exclusive(async () => {
    state = {};
    try { localStorage.removeItem(STORE); } catch { /* storage blocked */ }
  });
}

// ---------------------------------------------------------------- automatic

let pushTimer = null;

function schedulePush(delay = PUSH_DELAY_MS) {
  if (!state.session) return;
  clearTimeout(pushTimer);
  // Restarted by every edit, so tapping +250 ml four times in a row is one push, not four.
  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (navigator.onLine) syncNow().catch(() => {});
  }, delay);
}

export function startAutoSync() {
  db.subscribe(tables => {
    if (applyingRemote) return;
    if ([...tables].some(t => t in TABLES || t === 'sync_tombstone')) schedulePush();
  });
  // Only while the tab is on screen, and at most once a minute however often it is refocused:
  // a background tab costs Supabase nothing.
  let lastPull = 0;
  const pull = () => {
    if (!state.session || !navigator.onLine || document.visibilityState !== 'visible') return;
    if (Date.now() - lastPull < 60_000) return;
    lastPull = Date.now();
    syncNow().catch(() => {});
  };
  addEventListener('online', () => { emit(); pull(); });
  addEventListener('offline', emit);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pull();
    // Leaving the tab: send a queued edit now rather than when the timer would have fired.
    else if (pushTimer) schedulePush(0);
  });
  setInterval(pull, PULL_EVERY_MS);
  pull();
}

/** Edits not yet in the cloud: drives the "N unsynced" hint. */
export function pendingCount() {
  if (!state.session) return 0;
  let n = db.all('sync_tombstone').length;
  for (const t of Object.keys(TABLES)) {
    const since = watermark(t);
    n += db.all(t).filter(r => r.updatedAt > since && !r._remote).length;
  }
  return n;
}
