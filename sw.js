// Offline shell: the app's own files are cached on install and refreshed on every fetch.
// Supabase and YouTube requests are never cached. Bump VERSION when the file list changes.
const VERSION = 'forge-web-4';
const SHELL = [
  './', 'index.html', 'styles.css', 'config.js', 'icon.svg', 'manifest.webmanifest',
  'data/program.json', 'data/meal_plan.json',
  'vendor/fonts/barlow-latin-400-normal.woff2', 'vendor/fonts/barlow-latin-500-normal.woff2',
  'vendor/fonts/barlow-latin-600-normal.woff2', 'vendor/fonts/barlow-condensed-latin-600-normal.woff2',
  'vendor/fonts/barlow-condensed-latin-700-normal.woff2',
  'vendor/preact.module.js', 'vendor/hooks.module.js', 'vendor/htm.module.js',
  'js/app.js', 'js/ai.js', 'js/dates.js', 'js/db.js', 'js/program.js', 'js/reminders.js',
  'js/repo.js', 'js/settings.js', 'js/sync.js', 'js/timer.js',
  'js/ui/core.js', 'js/ui/components.js', 'js/ui/charts.js', 'js/ui/today.js', 'js/ui/workout.js',
  'js/ui/diet.js', 'js/ui/history.js', 'js/ui/progress.js', 'js/ui/dashboard.js', 'js/ui/photos.js', 'js/ui/library.js',
  'js/ui/settings.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network first, so a deploy shows up on the next load; the cache answers only when offline.
  e.respondWith(caches.open(VERSION).then(cache =>
    fetch(e.request).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cache.match(e.request, { ignoreSearch: true }))));
});

// A reminder tap focuses an open Forge tab on the right screen, or opens one.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const go = e.notification.data?.url ?? '#/today';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const tab = list[0];
    if (tab) { tab.postMessage({ go }); return tab.focus(); }
    return self.clients.openWindow(`./${go}`);
  }));
});
