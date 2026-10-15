import { useState } from 'preact/hooks';
import { TARGETS } from '../ai.js';
import { weekdayShort } from '../dates.js';
import { rescheduleAll } from '../reminders.js';
import { settings, update } from '../settings.js';
import * as sync from '../sync.js';
import { Chip, Modal, PageHeader, Panel } from './components.js';
import { html } from './core.js';

const withReschedule = patch => { update(patch); rescheduleAll(); };

export function SettingsScreen() {
  const s = settings();
  return html`
    <div class="page">
      <${PageHeader} title="Settings" sub="These apply to this browser. Your logs sync; settings do not, same as on the phone." />
      <div class="settings-grid">
        <${Panel} title="Cloud sync"><${CloudSection} /><//>

        <${Panel} title="Reminders">
          <${NotificationPermission} />
          <${TimeRow} title="Workout reminder" minutes=${s.workoutReminderMinutes}
            onChange=${m => withReschedule({ workoutReminderMinutes: m })} />
          <${TimeRow} title="Morning weigh-in" minutes=${s.weighInReminderMinutes}
            onChange=${m => withReschedule({ weighInReminderMinutes: m })} />
          <${TimeRow} title="Weekly photos, Sundays" minutes=${s.photoReminderMinutes}
            onChange=${m => withReschedule({ photoReminderMinutes: m })} />
          <${ToggleRow} title="Meal reminders" subtitle="Breakfast, lunch, pre- and post-workout, dinner"
            checked=${s.mealRemindersOn} onChange=${v => withReschedule({ mealRemindersOn: v })} />
          <${ChipRow} title="Water reminder" selected=${s.waterReminderIntervalMinutes}
            options=${[[0, 'Off'], [60, 'Every hour'], [90, 'Every 90 min'], [120, 'Every 2 hours']]}
            onSelect=${v => withReschedule({ waterReminderIntervalMinutes: v })} />
        <//>

        <${Panel} title="Workout">
          <${ChipRow} title="Rest between sets" selected=${s.restSeconds}
            options=${[[45, '45s'], [60, '60s'], [75, '75s'], [90, '90s'], [120, '2 min']]}
            onSelect=${v => update({ restSeconds: v })} />
          <${ToggleRow} title="Start rest automatically" subtitle="The timer starts the moment a set is completed"
            checked=${s.restTimerAutoStart} onChange=${v => update({ restTimerAutoStart: v })} />
          <${ToggleRow} title="Keep screen on" subtitle="While the Workout page is open, where the browser allows it"
            checked=${s.keepScreenOn} onChange=${v => update({ keepScreenOn: v })} />
        <//>

        <${Panel} title="Diet and goal">
          <div class="setting">
            <div class="setting-title">Veg days</div>
            <p class="muted small">These weekdays start on the Veg meal plan; every other day starts on Non-veg. Any single day can still be switched on the Diet page.</p>
            <div class="chips">
              ${[1, 2, 3, 4, 5, 6, 7].map(d => {
                const on = s.vegWeekdays.includes(d);
                return html`<${Chip} selected=${on} onClick=${() => update({
                  vegWeekdays: on ? s.vegWeekdays.filter(x => x !== d) : [...s.vegWeekdays, d].sort(),
                })}>${weekdayShort(d)}<//>`;
              })}
            </div>
          </div>
          <${ChipRow} title="Target weight" selected=${Math.trunc(s.goalWeightKg)}
            options=${[[70, '70 kg'], [72, '72 kg'], [75, '75 kg'], [78, '78 kg']]}
            onSelect=${v => update({ goalWeightKg: v })} />
          <${ChipRow} title="Where Ask AI sends your question" selected=${s.preferredAi}
            options=${TARGETS} onSelect=${v => update({ preferredAi: v })} />
        <//>
      </div>
    </div>`;
}

function CloudSection() {
  const st = sync.status();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const run = (block, done) => {
    if (st.busy) return;
    setMessage(null);
    block().then(r => setMessage(done(r)), e => setMessage(e.message || String(e)));
  };

  if (!st.configured) {
    return html`<p class="muted">Not set up. Fill in SUPABASE_URL and SUPABASE_KEY in config.js.</p>`;
  }
  const pending = sync.pendingCount();
  return html`
    <div>
      ${!st.signedIn
        ? html`
          <p class="muted">Sign in with the same Supabase account as the phone. Everything you log here
            is then saved to the cloud as you go, and the phone's logs appear here.</p>
          <form class="sign-in" onSubmit=${e => {
            e.preventDefault();
            const pw = password;
            setPassword('');
            run(() => sync.signIn(email, pw), n => `Signed in. First sync done${n ? `, ${n} rows pulled` : ''}.`);
          }}>
            <label class="field"><span>Email</span>
              <input type="email" autocomplete="username" value=${email} onInput=${e => setEmail(e.currentTarget.value)} />
            </label>
            <label class="field"><span>Password</span>
              <input type="password" autocomplete="current-password" value=${password}
                     onInput=${e => setPassword(e.currentTarget.value)} />
            </label>
            <button class="filled-button" type="submit" disabled=${st.busy || !email.trim() || !password}>Sign in</button>
          </form>`
        : html`
          <div class="setting-title">Signed in as ${st.email}</div>
          <div class="muted">Every change saves on its own; there is nothing to press.</div>
          <div class="muted">
            ${st.lastSyncAt ? `Last sync ${new Date(st.lastSyncAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not synced yet'}
            ${pending > 0 && ` · ${pending} edit${pending === 1 ? '' : 's'} waiting`}
            ${!st.online && ' · offline'}
          </div>
          ${st.lastError && html`<div class="error">Last attempt failed: ${st.lastError}</div>`}
          <div class="row gap-8 pad-top-12 wrap">
            <button type="button" class="outlined-button" disabled=${st.busy} onClick=${() => setConfirmRestore(true)}>Restore</button>
            <button type="button" class="text-button" disabled=${st.busy}
                    onClick=${() => run(sync.signOut, () => 'Signed out. Nothing will be uploaded.')}>Sign out</button>
          </div>`}
      ${st.busy && html`<div class="bar indeterminate"><div class="bar-fill" /></div>`}
      ${message && html`<p>${message}</p>`}
    </div>
    ${confirmRestore && html`
      <${Modal} title="Restore from cloud?" onClose=${() => setConfirmRestore(false)} actions=${html`
        <button type="button" class="text-button" onClick=${() => setConfirmRestore(false)}>Cancel</button>
        <button type="button" class="text-button" onClick=${() => {
          setConfirmRestore(false);
          run(sync.restore, n => `Restored ${n} rows from the cloud.`);
        }}>Restore</button>`}>
        <p>Re-reads every cloud row into this browser. A day already here is only replaced where the
          cloud copy is newer.</p>
      <//>`}`;
}

function NotificationPermission() {
  const [perm, setPerm] = useState('Notification' in window ? Notification.permission : 'unsupported');
  if (perm === 'unsupported') {
    return html`<p class="muted">This browser cannot show notifications, so reminders are off.</p>`;
  }
  return html`
    <div class="notice small-notice">
      <strong>${perm === 'granted' ? 'Reminders only fire while Forge is open' : 'Reminders need notifications'}</strong>
      <p>A web page cannot wake itself up. Keep Forge open in a tab or installed as an app and these
        arrive on time; with it closed, the phone's reminders still fire.</p>
      ${perm !== 'granted' && html`
        <button type="button" class="text-button" disabled=${perm === 'denied'}
                onClick=${() => Notification.requestPermission().then(p => { setPerm(p); rescheduleAll(); })}>
          ${perm === 'denied' ? 'Blocked in browser settings' : 'Allow notifications'}
        </button>`}
    </div>`;
}

const ToggleRow = ({ title, subtitle, checked, onChange }) => html`
  <label class="setting row toggle-row">
    <span class="grow">
      <span class="setting-title block">${title}</span>
      <span class="muted small">${subtitle}</span>
    </span>
    <input type="checkbox" role="switch" class="switch" checked=${checked}
           onChange=${e => onChange(e.currentTarget.checked)} />
  </label>`;

const ChipRow = ({ title, options, selected, onSelect }) => html`
  <div class="setting">
    <div class="setting-title">${title}</div>
    <div class="chips pad-top-6">
      ${options.map(([value, label]) => html`
        <${Chip} selected=${selected === value} onClick=${() => onSelect(value)}>${label}<//>`)}
    </div>
  </div>`;

const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** A native time picker, with a way to switch the reminder off and back on. */
const TimeRow = ({ title, minutes, onChange }) => html`
  <div class="setting row gap-12">
    <span class="grow setting-title">${title}</span>
    ${minutes < 0
      ? html`<span class="muted">Off</span>
        <button type="button" class="text-button" onClick=${() => onChange(360)}>Turn on</button>`
      : html`<input type="time" class="inline-input time-input" aria-label=${title} value=${hhmm(minutes)}
          onChange=${e => { const [h, m] = e.currentTarget.value.split(':').map(Number); if (!Number.isNaN(h)) onChange(h * 60 + m); }} />
        <button type="button" class="text-button" onClick=${() => onChange(-1)}>Turn off</button>`}
  </div>`;
