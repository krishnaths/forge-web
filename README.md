# Forge for the web

The Android app's features as a desktop web app: Today, Workout, Diet, History, Progress, Dashboard,
the exercise library, progress photos and Settings, with the same program, meal plan, rules, palette and
Supabase schema. Plain HTML and ES modules, no build step,. Installable as a PWA and usable
offline.

## Design

Laid out for a desktop or laptop screen, not stretched from the phone:

- A fixed sidebar holds the brand, where you are in the 6-week block, navigation and sync status.
- Pages sit on a 12-column grid. Today is a dashboard with the session, body weight, all four
  targets side by side, every meal and the habits. Workout has two panes: the exercise list, and
  the active exercise with a set table, type-in steppers, the form video inline and the rest timer.
  History puts the calendar and day table beside a day editor.
- Dashboard (formerly the separate forge-dashboard site) charts a 7-day to 1-year range: targets
  hit per day, water, steps, meals per slot, other habits, weight, sessions and volume per week, and
  an every-day table. It reads the local store like every other screen, so it works offline; a day
  in the heatmap or table opens in History's editor.
- Keyboard: on Workout, `Enter` completes the set and `↑`/`↓` switch exercise. Dialogs close with
  `Esc`. Charts read out a point on hover, or with the arrow keys once focused.
- The phone's palette (Theme.kt): orange for the next action, green only for a target hit.
  Numbers are set in Barlow Condensed, like the figures stamped on a weight plate; text in Barlow.
  Both are vendored in `vendor/fonts` (SIL OFL).
- Below 900 px the sidebar becomes a bottom bar and the grid stacks, so it still works on a phone.

Live at **https://krishnaths.github.io/forge-web/**. Sign in under Settings with the same Supabase
account as the phone.

## Run it locally

```bash
python3 -m http.server 8790        # from this folder
open http://127.0.0.1:8790/
node --test tests/app.test.mjs     # no dependencies
```

It must be served over HTTPS (or localhost) for the service worker, clipboard and notifications.

## Publishing

The source lives in `web/` of the private app repo; this public repo (`krishnaths/forge-web`) is
that folder's history and nothing else. From the app repo, after committing:

```bash
tools/publish_web.sh
```

It checks the program data, runs the tests and pushes `web/` here. The Pages workflow
(`.github/workflows/pages.yml`) tests again and deploys; a failing test blocks the deploy.

### Why the public copy is safe

- No personal data: `data/program.json` is written by `tools/sync_web_assets.py`, which drops the
  workbook's `client` block and `seed` history. Your logs reach the app only from Supabase, after
  you sign in, and are never part of the site.
- `config.js` holds the Supabase URL and the publishable key. Both are meant to be public: every
  table has row-level security, so the key alone reads and writes nothing.
- A Content Security Policy limits scripts to this site, network calls to Supabase and frames to
  YouTube's no-cookie player.

## Data and sync

The browser is local-first, like the phone: every log lives in IndexedDB, held in memory while the
app is open (`js/db.js`), so it works offline and every tap is instant.

Signing in under **Settings → Cloud sync**, with the same Supabase user as the phone, turns on
two-way sync with `supabase/migrations/0001_init.sql`. No schema change is needed.

- **Push** is the phone's `SyncEngine`: per-table `updatedAt` watermarks, upsert on the natural
  key, undone sets sent as DELETEs from `sync_tombstone`. It runs 3 s after the last edit, so
  online it is effectively a direct save to Supabase. There is no "Sync now" button: nothing needs pressing. Offline, edits queue in IndexedDB and go up
  when the connection returns.
- **Pull** runs on open, on returning to the tab, and every 5 minutes. It keeps a remote row only
  where the browser has none or an older one. That means phone edits show up here with no manual
  step. It re-reads a day of overlap so a phone that pushes late is not missed.
- **Conflicts:** the newest `updated_at` wins, on both sides. The `keep_newer` trigger stops
  either device from rolling the other back.

### What the phone sees

The phone syncs both ways too: on open, every 5 minutes while on screen, a few seconds after an
edit, and every 6 hours in the background. A web edit shows on the phone the next time it is
opened. One gap remains on both sides: an undone set is deleted from Supabase, but a device that
already pulled it keeps it until it is undone there as well.

Supabase cost stays negligible: a pull asks only for rows changed since the last one (seven small
requests), a hidden browser tab never polls, and refocusing pulls at most once a minute.

## Differences from the phone, and why

| Phone | Web |
|---|---|
| Steps from Health Connect | Typed in. Health Connect has no web API. Steps the phone read still sync across. |
| Exact-alarm reminders | Notifications fire only while Forge is open (a web page cannot wake itself). Times are set with a time picker. |
| Rest timer on the monotonic clock | A wall-clock deadline in `localStorage`. It survives reloads and locking, not a clock change. |
| Gemini / ChatGPT share intent | Prompt copied, then the vendor's web app opens (or the share sheet for "Choose app"). The prompt never goes in a URL. |
| Photos in app-private storage, `FLAG_SECURE` | Photos are blobs in IndexedDB and never uploaded. Browsers have no screenshot block. |
| Settings in DataStore | Settings in `localStorage`, per device, not synced (neither are the phone's). |

One fix beyond the phone: after undoing a set, the next set takes the first free index. The phone
uses the logged-set count, so undoing set 1 of 3 and then completing a set overwrites set 3.

## Program content

`data/program.json` and `data/meal_plan.json` come from the app's `app/src/main/assets/`. After
regenerating the program with `tools/extract_program.py`, run `tools/sync_web_assets.py` and publish.
Installed copies pick up the change on their next load; bump `VERSION` in `sw.js` only when the list
of files changes.

Without the workbook history in the public data, a browser that never signs in starts empty;
signed in, it pulls the history the phone uploaded.

## Layout

```
index.html, styles.css, sw.js, manifest.webmanifest, config.js (Supabase URL + publishable key)
js/db.js          IndexedDB + in-memory tables
js/repo.js        ForgeRepository / DayTracker / view-model logic
js/sync.js        Supabase REST: auth, push, pull, restore, auto-sync
js/program.js     program.json + meal plan
js/ai.js, timer.js, reminders.js, settings.js, dates.js
js/ui/            one module per screen, plus components and charts
tests/            node --test suite (dates, program rules, streaks, offline cache, schema)
vendor/           Preact 10.24.3, htm 3.1.1 (MIT) and Barlow (OFL), vendored so it runs offline
```
