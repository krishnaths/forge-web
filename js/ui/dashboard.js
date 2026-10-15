// The numbers behind the program over a chosen range: what forge-dashboard used to show, read from
// the same local store as every other screen (so it works offline and shows phone edits once they
// sync down), instead of querying Supabase on its own.

import { useState } from 'preact/hooks';
import { addDays, daysBetween, parse, todayIso, weekStart } from '../dates.js';
import { mealPlan, Targets } from '../program.js';
import * as repo from '../repo.js';
import { settings } from '../settings.js';
import { ColumnChart, HeatCalendar, LineChart } from './charts.js';
import { PageHeader, Panel, ProgressBar, Stat } from './components.js';
import { formatKg, formatLitres, html, nf, titleCase } from './core.js';
import { openDay } from './history.js';

const RANGES = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']];
const OTHER_HABITS = [3, 4, 5];
const SESSIONS_PER_WEEK = 6;

function savedRange() {
  try { return RANGES.some(([n]) => n === +localStorage.getItem('forge-dash-range')) ? +localStorage.getItem('forge-dash-range') : 30; }
  catch { return 30; }
}

const thousands = v => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v));
const rowDay = s => parse(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const weekTitle = s => `Week of ${parse(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function DashboardScreen() {
  const [range, setRangeState] = useState(savedRange);
  const setRange = n => {
    setRangeState(n);
    try { localStorage.setItem('forge-dash-range', String(n)); } catch { /* storage blocked */ }
  };

  const today = todayIso();
  const from = addDays(today, -(range - 1));
  const veg = settings().vegWeekdays;
  const days = repo.summarise(from, today, veg);
  const st = repo.streaks(veg);
  const n = days.length;
  const count = f => days.filter(f).length;

  const water = days.filter(d => d.waterMl > 0).map(d => d.waterMl);
  const steps = days.filter(d => d.steps != null).map(d => d.steps);
  const waterAvg = avg(water);
  const stepsAvg = avg(steps);

  // Meals per slot, over the days that had any meal ticked.
  const meals = repo.mealLogs(from, today);
  const mealDays = new Set(meals.filter(m => m.followed).map(m => m.day));
  const slots = mealPlan.dayTypes[0].slots;

  const weights = repo.weights().filter(w => w.day >= from);
  const sessions = repo.sessions().filter(s => s.day >= weekStart(from));
  const sets = repo.sets().filter(s => s.day >= weekStart(from));
  const weeks = [];
  for (let w = weekStart(from); w <= today; w = addDays(w, 7)) weeks.push(w);
  const perWeek = (rows, value) => {
    const m = new Map();
    for (const r of rows) m.set(weekStart(r.day), (m.get(weekStart(r.day)) ?? 0) + value(r));
    return m;
  };
  const sessionsByWeek = perWeek(sessions.filter(s => s.finishedAt != null), () => 1);
  const volumeByWeek = perWeek(sets, s => s.weightKg * s.reps);

  const weightByDay = new Map(weights.map(w => [w.day, w.kg]));
  const sessionByDay = new Map(sessions.map(s => [s.day, s]));

  return html`
    <div class="page">
      <${PageHeader} title="Dashboard" sub="Daily targets, diet and training over time."
        actions=${html`
          <div class="segmented" role="radiogroup" aria-label="Date range">
            ${RANGES.map(([days, label]) => html`
              <button type="button" role="radio" aria-checked=${days === range}
                      class=${days === range ? 'selected' : ''} onClick=${() => setRange(days)}>${label}</button>`)}
          </div>`} />

      <div class="stat-row">
        <${Stat} label="Diet followed" value=${count(d => d.dietMet)} unit=${` / ${n} days`}
          sub=${`Streak ${st.diet} ${st.diet === 1 ? 'day' : 'days'}`} />
        <${Stat} label="Water" value=${waterAvg == null ? '—' : (waterAvg / 1000).toFixed(1)} unit=" L / day"
          sub=${`4 L on ${count(d => d.waterMet)} of ${n} days`} />
        <${Stat} label="Steps" value=${stepsAvg == null ? '—' : nf.format(Math.round(stepsAvg))} unit=" / day"
          sub=${`12k on ${count(d => d.stepsMet)} of ${n} days`} />
        <${Stat} label="Meditation" value=${count(d => d.meditationMet)} unit=${` / ${n} days`}
          sub=${`Streak ${st.meditation} ${st.meditation === 1 ? 'day' : 'days'}`} />
      </div>

      <div class="grid">
        <${Panel} cls="span-12" title="Targets hit per day"
          actions=${html`<div class="legend">
            ${[0, 1, 2, 3, 4].map(s => html`<span><i class=${`heat-key heat-${s}`} />${s}</span>`)}
          </div>`}>
          <p class="muted small">Diet (all six meals), 4 L water, 12k steps, 10 min meditation. Pick a day to edit it.</p>
          <${HeatCalendar} days=${days} today=${today} onPick=${openDay} />
        <//>

        <${Panel} cls="span-6" title="Water" actions=${html`<span class="muted">Litres per day</span>`}>
          <${ColumnChart} label="Water per day" target=${Targets.WATER_ML / 1000} targetLabel="4 L"
            fmt=${v => `${+v.toFixed(1)} L`}
            bars=${days.map(d => ({ day: d.day, value: d.waterMl ? d.waterMl / 1000 : null, text: d.waterMl ? `${formatLitres(d.waterMl)} L` : '' }))} />
        <//>

        <${Panel} cls="span-6" title="Steps" actions=${html`<span class="muted">Steps per day</span>`}>
          <${ColumnChart} label="Steps per day" target=${Targets.STEPS} targetLabel="12k" fmt=${thousands}
            bars=${days.map(d => ({ day: d.day, value: d.steps, text: d.steps != null ? `${nf.format(d.steps)} steps` : '' }))} />
        <//>

        <${Panel} cls="span-6" title="Meals followed" actions=${html`<span class="muted">Share of days with any meal ticked</span>`}>
          ${mealDays.size
            ? html`<div class="ratio-list">
                ${slots.map(s => {
                  const hit = meals.filter(m => m.slotKey === s.key && m.followed).length;
                  return html`<${Ratio} label=${s.title} hit=${hit} of=${mealDays.size} />`;
                })}
              </div>`
            : html`<p class="muted">No meals ticked in this range.</p>`}
        <//>

        <${Panel} cls="span-6" title="Other habits" actions=${html`<span class="muted">Days ticked in range</span>`}>
          <div class="ratio-list">
            ${OTHER_HABITS.map(i => html`<${Ratio} label=${repo.HABIT_LABELS[i]} hit=${count(d => d.habits[i])} of=${n} />`)}
          </div>
        <//>

        <${Panel} cls="span-12" title="Weight" actions=${html`<span class="muted">kg</span>`}>
          <${LineChart} points=${weights.map(w => ({ x: daysBetween('1970-01-01', w.day), y: w.kg, day: w.day }))}
            goal=${settings().goalWeightKg} unit=" kg" label="Body weight in range" />
        <//>

        <${Panel} cls="span-6" title="Sessions per week" actions=${html`<span class="muted">Finished workouts</span>`}>
          <${ColumnChart} label="Sessions per week" target=${SESSIONS_PER_WEEK} targetLabel="6 a week" empty="No workouts in this range"
            bars=${sessions.length ? weeks.map(w => ({ day: w, value: sessionsByWeek.get(w) ?? 0, text: `${sessionsByWeek.get(w) ?? 0} sessions`, title: weekTitle(w) })) : []} />
        <//>

        <${Panel} cls="span-6" title="Training volume per week" actions=${html`<span class="muted">Weight × reps, kg</span>`}>
          <${ColumnChart} label="Training volume per week" fmt=${thousands} empty="No workouts in this range"
            bars=${sets.length ? weeks.map(w => ({ day: w, value: Math.round(volumeByWeek.get(w) ?? 0), text: `${nf.format(Math.round(volumeByWeek.get(w) ?? 0))} kg`, title: weekTitle(w) })) : []} />
        <//>

        <${Panel} cls="span-12" title="Every day" actions=${html`<span class="muted">The table behind every chart. Pick a day to edit it.</span>`}>
          <div class="table-scroll">
            <table class="data-table compact days-table dash-table">
              <thead><tr>
                ${['Day', 'Plan', 'Meals', 'Water', 'Steps', 'Meditated', 'Sleep', 'Walk', 'Skipping', 'Weight', 'Workout']
                  .map(h => html`<th scope="col">${h}</th>`)}
              </tr></thead>
              <tbody>
                ${[...days].reverse().map(d => {
                  const s = sessionByDay.get(d.day);
                  return html`
                    <tr onClick=${() => openDay(d.day)}>
                      <td>${rowDay(d.day)}</td>
                      <td class="muted">${d.dayType === 'VEG' ? 'Veg' : 'Non-veg'}</td>
                      <td class=${`num ${d.dietMet ? 'good' : ''}`}>${d.mealsFollowed}/${d.mealsTotal}</td>
                      <td class=${`num ${d.waterMet ? 'good' : ''}`}>${d.waterMl ? `${formatLitres(d.waterMl)} L` : '—'}</td>
                      <td class=${`num ${d.stepsMet ? 'good' : ''}`}>${d.steps != null ? nf.format(d.steps) : '—'}</td>
                      ${[d.meditationMet, d.habits[3], d.habits[4], d.habits[5]].map(v => html`<td class=${v ? 'good' : 'muted'}>${v ? '✓' : '—'}</td>`)}
                      <td class="num">${weightByDay.has(d.day) ? `${formatKg(weightByDay.get(d.day))} kg` : '—'}</td>
                      <td>${s ? `${titleCase(s.focus)}${s.finishedAt ? '' : ' (unfinished)'}` : '—'}</td>
                    </tr>`;
                })}
              </tbody>
            </table>
          </div>
        <//>
      </div>
    </div>`;
}

const Ratio = ({ label, hit, of }) => html`
  <div class="ratio">
    <div class="ratio-head"><span>${label}</span><span><strong>${of ? Math.round((hit / of) * 100) : 0}%</strong> <span class="muted small">${hit} of ${of}</span></span></div>
    <${ProgressBar} fraction=${of ? hit / of : 0} thin />
  </div>`;
