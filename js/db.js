// Local store: IndexedDB, mirrored in memory. The whole log is a few thousand small rows, so every
// table is read once at startup and queries are plain array code; writes go to memory first (the
// UI re-renders at once) and then to IndexedDB. This is the browser's Room.

/** The tables cloud sync mirrors, each with its natural key. Same keys as the Supabase schema. */
export const SYNCED = {
  daily_log: r => r.day,
  meal_log: r => `${r.day}|${r.slotKey}`,
  habit_entry: r => `${r.day}|${r.habitIndex}`,
  weight_entry: r => r.day,
  measurement: r => r.day,
  workout_session: r => r.day,
  set_log: r => `${r.day}|${r.exerciseName}|${r.setIndex}`,
};

const LOCAL = {
  sync_tombstone: r => String(r.id),
  progress_photo: r => `${r.day}|${r.angle}`,
  meta: r => r.key,
};

const KEYS = { ...SYNCED, ...LOCAL };
const TABLES = Object.keys(KEYS);
const BLOBS = 'photo_blob';

let idb = null;
const mem = Object.fromEntries(TABLES.map(t => [t, new Map()]));
const listeners = new Set();

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function openDb() {
  const open = indexedDB.open('forge', 1);
  open.onupgradeneeded = () => {
    for (const t of [...TABLES, BLOBS]) {
      if (!open.result.objectStoreNames.contains(t)) open.result.createObjectStore(t);
    }
  };
  idb = await req(open);
  const tx = idb.transaction(TABLES, 'readonly');
  await Promise.all(TABLES.map(async t => {
    const [keys, rows] = await Promise.all([
      req(tx.objectStore(t).getAllKeys()),
      req(tx.objectStore(t).getAll()),
    ]);
    keys.forEach((k, i) => mem[t].set(k, rows[i]));
  }));
}

export const all = t => [...mem[t].values()];
export const get = (t, key) => mem[t].get(key);
export const keyOf = (t, row) => KEYS[t](row);

/**
 * Applies a batch of writes atomically: `ops` is a list of ['put', table, row] or
 * ['del', table, key]. Listeners hear about it once, with the set of tables touched.
 */
export function write(ops) {
  if (!ops.length) return Promise.resolve();
  const tables = new Set(ops.map(o => o[1]));
  for (const [op, t, x] of ops) {
    if (op === 'put') mem[t].set(KEYS[t](x), x);
    else mem[t].delete(x);
  }
  const tx = idb.transaction([...tables], 'readwrite');
  for (const [op, t, x] of ops) {
    if (op === 'put') tx.objectStore(t).put(x, KEYS[t](x));
    else tx.objectStore(t).delete(x);
  }
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
  listeners.forEach(fn => fn(tables));
  return done;
}

export const put = (t, row) => write([['put', t, row]]);

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------- meta (watermarks, flags)

export const meta = key => mem.meta.get(key)?.value;
export const setMeta = (key, value) => put('meta', { key, value });

// ---------------------------------------------------------------- photo blobs

export async function putBlob(key, blob) {
  const tx = idb.transaction(BLOBS, 'readwrite');
  tx.objectStore(BLOBS).put(blob, key);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

export function getBlob(key) {
  return req(idb.transaction(BLOBS, 'readonly').objectStore(BLOBS).get(key));
}

export async function deleteBlob(key) {
  const tx = idb.transaction(BLOBS, 'readwrite');
  tx.objectStore(BLOBS).delete(key);
  await new Promise(resolve => { tx.oncomplete = resolve; });
}

/** Nothing has ever been written: the cue to seed the workbook history. */
export const isEmpty = () => TABLES.every(t => mem[t].size === 0);
