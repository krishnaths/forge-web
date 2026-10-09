import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { todayIso } from './dates.js';
import * as db from './db.js';
import { loadProgram } from './program.js';
import { rescheduleAll } from './reminders.js';
import { positionFor, seedIfNeeded } from './repo.js';
import { onSettings, settings } from './settings.js';
import * as sync from './sync.js';
import { html, Icon, Toasts } from './ui/core.js';
import { DietScreen } from './ui/diet.js';
import { HistoryScreen } from './ui/history.js';
import { LibraryScreen } from './ui/library.js';
import { PhotosScreen } from './ui/photos.js';
import { ProgressScreen } from './ui/progress.js';
import { SettingsScreen } from './ui/settings.js';
import { TodayScreen } from './ui/today.js';
import { WorkoutScreen } from './ui/workout.js';

const PRIMARY = [
  ['today', 'Today', 'today'],
  ['workout', 'Workout', 'workout'],
  ['diet', 'Diet', 'diet'],
  ['history', 'History', 'history'],
  ['progress', 'Progress', 'progress'],
];
const SECONDARY = [
  ['library', 'Exercise library', 'library'],
  ['photos', 'Progress photos', 'camera'],
  ['settings', 'Settings', 'settings'],
];

const SCREENS = {
  today: TodayScreen, workout: WorkoutScreen, diet: DietScreen, history: HistoryScreen,
  progress: ProgressScreen, library: LibraryScreen, photos: PhotosScreen, settings: SettingsScreen,
};

const route = () => {
  const r = location.hash.replace(/^#\/?/, '');
  return SCREENS[r] ? r : 'today';
};

const go = r => { location.hash = `#/${r}`; };

/** Where the sidebar says you are in the coach's block. */
function BlockPosition() {
  const pos = positionFor(todayIso(), settings().programStart);
  return html`
    <div class="block-pos" aria-label=${`Week ${pos.week}, day ${pos.dayOfWeek} of the 6-week block`}>
      <div class="block-weeks" aria-hidden="true">
        ${[1, 2, 3, 4, 5, 6].map(w => html`<i class=${w < pos.week ? 'past' : w === pos.week ? 'now' : ''} />`)}
      </div>
      <div><span class="block-num">Week ${pos.week}</span> <span class="muted">day ${pos.dayOfWeek}</span></div>
      ${pos.planComplete && html`<div class="muted small">Block complete</div>`}
    </div>`;
}

function SyncStatus() {
  const st = sync.status();
  if (!st.configured) return null;
  if (!st.signedIn) {
    return html`<a class="sync-status" href="#/settings"><${Icon} name="cloudOff" size=${16} /> Saved on this device only</a>`;
  }
  const pending = sync.pendingCount();
  const text = !st.online ? 'Offline, saved here' : st.busy ? 'Syncing'
    : st.lastError ? 'Sync failed' : pending ? 'Saving' : 'Synced';
  return html`<a class=${`sync-status ${st.lastError ? 'error' : ''}`} href="#/settings" title=${st.lastError ?? st.email}>
    <${Icon} name=${st.online ? 'cloud' : 'cloudOff'} size=${16} /> ${text}</a>`;
}

const NavLink = ({ id, label, icon, current }) => html`
  <a href=${`#/${id}`} class=${id === current ? 'selected' : ''} aria-current=${id === current ? 'page' : undefined}>
    <${Icon} name=${icon} size=${20} /><span>${label}</span>
  </a>`;

function App() {
  const [r, setRoute] = useState(route());
  const [, rerender] = useState(0);

  useEffect(() => {
    // Every screen reads straight from the in-memory store, so any change re-renders the tree:
    // a few thousand rows of plain array code, the browser's version of Room's Flow.
    const bump = () => rerender(n => n + 1);
    const offs = [db.subscribe(bump), onSettings(bump), sync.onStatus(bump)];
    const onHash = () => { setRoute(route()); document.querySelector('.main')?.scrollTo(0, 0); scrollTo(0, 0); };
    addEventListener('hashchange', onHash);
    // Today must be correct across midnight and after the tab sat in the background.
    document.addEventListener('visibilitychange', bump);
    const minute = setInterval(bump, 60_000);
    return () => {
      offs.forEach(f => f());
      removeEventListener('hashchange', onHash);
      document.removeEventListener('visibilitychange', bump);
      clearInterval(minute);
    };
  }, []);

  const Screen = SCREENS[r];
  return html`
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="#/today" aria-label="Forge, today">
          <svg viewBox="24 35 60 38" width="34" height="22" aria-hidden="true"><path fill="var(--primary)" d="M28,48h7v-9h7v9h24v-9h7v9h7v12h-7v9h-7v-9H42v9h-7v-9h-7z"/></svg>
          <span>Forge</span>
        </a>
        <${BlockPosition} />
        <nav class="nav" aria-label="Sections">
          ${PRIMARY.map(([id, label, icon]) => html`<${NavLink} id=${id} label=${label} icon=${icon} current=${r} />`)}
        </nav>
        <nav class="nav secondary" aria-label="More">
          ${SECONDARY.map(([id, label, icon]) => html`<${NavLink} id=${id} label=${label} icon=${icon} current=${r} />`)}
        </nav>
        <div class="sidebar-foot"><${SyncStatus} /></div>
      </aside>
      <main class="main" id="main"><${Screen} go=${go} /></main>
      <${Toasts} />
    </div>`;
}

async function boot() {
  try {
    await Promise.all([db.openDb(), loadProgram()]);
    await seedIfNeeded();
  } catch (e) {
    document.getElementById('app').textContent = `Forge could not start: ${e.message}`;
    throw e;
  }
  render(html`<${App} />`, document.getElementById('app'));
  sync.startAutoSync();
  rescheduleAll();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is best-effort */ });
    // A notification tap focuses this tab and asks for a screen.
    navigator.serviceWorker.addEventListener('message', e => { if (e.data?.go) location.hash = e.data.go; });
  }
  // Ask the browser to keep IndexedDB rather than evict it under storage pressure.
  navigator.storage?.persist?.();
}

boot();
