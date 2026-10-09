import { useState } from 'preact/hooks';
import { daysBetween, shortDate, todayIso, weekStart } from '../dates.js';
import * as repo from '../repo.js';
import { settings } from '../settings.js';
import { AskAiButton, AskAiModal, Modal, PageHeader, Panel, Stat } from './components.js';
import { BarChart, LineChart, StreakGrid } from './charts.js';
import { formatKg, html, toast } from './core.js';
import { PhotoThumb } from './photos.js';

const SITES = [
  ['Left arm', 'leftArm'], ['Right arm', 'rightArm'],
  ['Left thigh', 'leftThigh'], ['Right thigh', 'rightThigh'],
  ['Waist top', 'waistTop'], ['Waist middle', 'waistMiddle'], ['Waist lower', 'waistLower'],
];

export function ProgressScreen() {
  const [ask, setAsk] = useState(null);
  const [editing, setEditing] = useState(false);
  const s = settings();
  const weights = repo.weights();
  const meas = repo.measurements();
  const habitDays = repo.habitDays();
  const sessions = repo.completedSessionCount();
  const volume = repo.volumeByDay().slice(-20).map(([day, value]) => ({ day, value }));
  const start = weights[0];
  const latest = weights[weights.length - 1];
  const points = weights.map(w => ({ x: daysBetween('1970-01-01', w.day), y: w.kg, day: w.day }));
  const ticks = habitDays.reduce((n, [, flags]) => n + flags.filter(Boolean).length, 0);
  const photos = repo.photos();
  const latestWeek = photos[0] ? weekStart(photos[0].day) : null;

  const askWeight = () => {
    let body = `Height ${s.heightCm} cm.\n`;
    if (start) body += `Start: ${formatKg(start.kg)} kg on ${start.day}\n`;
    if (latest) body += `Now: ${formatKg(latest.kg)} kg on ${latest.day}\n`;
    body += `Goal: ${formatKg(s.goalWeightKg)} kg\nSessions completed: ${sessions}\n`;
    setAsk({ kind: 'stat', title: 'your weight trend', body });
  };

  return html`
    <div class="page">
      <${PageHeader} title="Progress" sub="The whole transformation so far."
        actions=${html`
          <${AskAiButton} onClick=${askWeight} label="Ask about my trend" />
          <button type="button" class="filled-button" onClick=${() => setEditing(true)}>Add measurements</button>`} />

      <div class="stat-row">
        <${Stat} label="Lost" value=${start && latest ? formatKg(start.kg - latest.kg) : '—'} unit=" kg"
          sub=${start ? `Since ${shortDate(start.day)}` : null} />
        <${Stat} label="Current weight" value=${latest ? formatKg(latest.kg) : '—'} unit=" kg"
          sub=${latest ? `Goal ${formatKg(s.goalWeightKg)} kg` : null} />
        <${Stat} label="Sessions completed" value=${sessions} />
        <${Stat} label="Habits ticked" value=${ticks} sub=${`Across ${habitDays.length} days`} />
      </div>

      <div class="grid">
        <${Panel} cls="span-8" title="Weight">
          <${LineChart} points=${points} goal=${s.goalWeightKg} unit=" kg" label="Body weight over time" />
        <//>

        <${Panel} cls="span-4" title="Measurements"
          actions=${html`<button type="button" class="text-button" onClick=${() => setEditing(true)}>Add</button>`}>
          ${meas.length === 0
            ? html`<p class="muted">No measurements yet. Add today's to start tracking.</p>`
            : html`
              <table class="data-table compact">
                <thead><tr><th /><th>Start</th><th>Now</th><th>Change</th></tr></thead>
                <tbody>
                  ${SITES.map(([label, key]) => {
                    const now = meas[meas.length - 1][key];
                    const then = meas[0][key];
                    const diff = now != null && then != null ? now - then : null;
                    return html`
                      <tr>
                        <td class="muted">${label}</td>
                        <td class="num">${then != null ? formatKg(then) : '—'}</td>
                        <td class="num strong">${now != null ? formatKg(now) : '—'}</td>
                        <td class=${`num ${diff < 0 ? 'good' : ''}`}>${diff ? `${diff > 0 ? '+' : ''}${formatKg(diff)}` : '—'}</td>
                      </tr>`;
                  })}
                </tbody>
              </table>
              <p class="muted small">Centimetres. Start ${shortDate(meas[0].day)}, latest ${shortDate(meas[meas.length - 1].day)}.</p>`}
        <//>

        <${Panel} cls="span-6" title="Training volume" actions=${html`<span class="muted">Last 20 sessions, kg × reps</span>`}>
          <${BarChart} bars=${volume} unit=" kg" label="Training volume per session" />
        <//>

        <${Panel} cls="span-6" title="Habits" actions=${html`<span class="muted">Last 60 logged days</span>`}>
          <${StreakGrid} days=${habitDays.slice(-60)} labels=${repo.HABIT_LABELS} />
          <div class="habit-counts">
            ${repo.HABIT_LABELS.map((label, i) => html`
              <div><span class="muted">${label}</span> <strong>${habitDays.filter(([, f]) => f[i]).length}</strong></div>`)}
          </div>
        <//>

        <${Panel} cls="span-12" title="Progress photos"
          actions=${html`<a class="text-button" href="#/photos">Open photos</a>`}>
          ${latestWeek
            ? html`
              <div class="photo-strip">
                ${['FRONT', 'BACK', 'SIDE'].map(angle => html`
                  <${PhotoThumb} photo=${photos.find(p => p.angle === angle && weekStart(p.day) === latestWeek)} angle=${angle} />`)}
                <p class="muted">Week of ${shortDate(latestWeek)}. ${photos.length} photos in total, kept in this browser only.</p>
              </div>`
            : html`<p class="muted">No photos yet. <a class="text-button" href="#/photos">Take this week's set</a></p>`}
        <//>
      </div>
    </div>
    ${editing && html`<${MeasurementModal} onClose=${() => setEditing(false)} last=${meas[meas.length - 1]} onSave=${m => {
      repo.saveMeasurement(m); setEditing(false); toast('Measurements saved');
    }} />`}
    ${ask && html`<${AskAiModal} ctx=${ask} onClose=${() => setAsk(null)} />`}`;
}

function MeasurementModal({ onClose, onSave, last }) {
  const [values, setValues] = useState({});
  const save = () => {
    const v = k => {
      const n = parseFloat((values[k] ?? '').trim().replace(',', '.'));
      return n >= 1 && n <= 250 ? n : null;
    };
    const m = { day: todayIso() };
    for (const [, key] of SITES) m[key] = v(key);
    onSave(m);
  };
  return html`
    <${Modal} title="Today's measurements" onClose=${onClose} actions=${html`
      <button type="button" class="text-button" onClick=${onClose}>Cancel</button>
      <button type="button" class="filled-button" onClick=${save}>Save measurements</button>`}>
      <p class="muted">Centimetres. Leave any blank. The grey number is your last measurement.</p>
      <form class="measure-form" onSubmit=${e => { e.preventDefault(); save(); }}>
        ${SITES.map(([label, key]) => html`
          <label class="field"><span>${label}</span>
            <input inputmode="decimal" placeholder=${last?.[key] != null ? formatKg(last[key]) : ''} value=${values[key] ?? ''}
                   onInput=${e => setValues(v => ({ ...v, [key]: e.currentTarget.value }))} />
          </label>`)}
        <button type="submit" hidden />
      </form>
    <//>`;
}

