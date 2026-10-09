// Between-set rest. One deadline (wall-clock ms) in localStorage, written on start and on cancel,
// never per tick, so the countdown survives a reload, a locked phone or a closed tab. The browser
// has no monotonic clock that outlives a page, so this is the closest equivalent of the phone's
// elapsedRealtime deadline.

const KEY = 'forge_rest';
const listeners = new Set();
let doneTimer = null;

export function active() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || 'null');
    return t && t.endsAt > Date.now() ? t : null;
  } catch {
    return null;
  }
}

export const remainingSeconds = t => Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000));

function persist(t) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch { /* storage blocked: the timer still runs for this page */ }
  arm(t);
  listeners.forEach(fn => fn(t));
}

export function start(exerciseName, setIndex, seconds) {
  persist({ exerciseName, setIndex, durationSeconds: seconds, endsAt: Date.now() + seconds * 1000 });
}

export const cancel = () => persist(null);

export function addSeconds(n) {
  const t = active();
  if (t) start(t.exerciseName, t.setIndex, Math.max(5, remainingSeconds(t) + n));
}

export function onTimer(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** When the deadline passes: buzz, and notify if the page is in the background. */
function arm(t) {
  clearTimeout(doneTimer);
  if (!t) return;
  doneTimer = setTimeout(() => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    navigator.vibrate?.([200, 100, 200]);
    if (document.visibilityState !== 'visible') notify('Rest complete', 'Next set.', '#/workout');
    listeners.forEach(fn => fn(null));
  }, t.endsAt - Date.now());
}

arm(active());

export async function notify(title, body, url) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) reg.showNotification(title, { body, icon: 'icon.svg', tag: title, data: { url } });
  else new Notification(title, { body });
}
