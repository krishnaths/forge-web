import { useState } from 'preact/hooks';
import {
  addMonths, dayOfWeek, longDate, monthOf, monthTitle, rowDate, todayIso, weekdayShort,
} from '../dates.js';
import { mealPlan } from '../program.js';
import * as repo from '../repo.js';
import { settings } from '../settings.js';
import {
  CheckRow, DayTypeSwitch, Figure, MealTickRow, MeditationControl, PageHeader, Panel, StepsControl, WaterControl,
} from './components.js';
import { formatLitres, html, Icon, nf } from './core.js';
import { dayActions } from './today.js';

/** One colour per target, for the calendar marks, the legend and the table. */
const TARGETS = [
  ['Diet', 'var(--t-diet)', d => d.dietMet],
  ['Water', 'var(--t-water)', d => d.waterMet],
  ['Steps', 'var(--t-steps)', d => d.stepsMet],
  ['Meditation', 'var(--t-med)', d => d.meditationMet],
];

let month = null;
let selected = null;

export function HistoryScreen() {
  const [, rerender] = useState(0);
  const today = todayIso();
  const veg = settings().vegWeekdays;
  month ??= monthOf(today);
  selected ??= today;
  const setMonth = m => { month = m; rerender(n => n + 1); };
  // Future days have nothing to record yet.
  const pick = day => {
    if (day > today) return;
    selected = day;
    rerender(n => n + 1);
    // When the editor sits below the calendar (narrower windows), bring it to the day just picked.
    if (matchMedia('(max-width: 1180px)').matches) {
      requestAnimationFrame(() => document.querySelector('.day-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const days = repo.monthSummaries(month, veg);
  const st = repo.streaks(veg);
  const counts = [st.diet, st.water, st.steps, st.meditation];
  const rows = days.filter(d => d.day <= today).reverse();

  return html`
    <div class="page">
      <${PageHeader} title="History" sub="Every day's four targets. Pick a day to fill in what you missed."
        actions=${html`
          <div class="month-nav">
            <button type="button" class="icon-button" aria-label="Previous month" onClick=${() => setMonth(addMonths(month, -1))}>
              <${Icon} name="left" />
            </button>
            <span class="month-title">${monthTitle(month)}</span>
            <button type="button" class="icon-button" aria-label="Next month" disabled=${month >= monthOf(today)}
                    onClick=${() => setMonth(addMonths(month, 1))}>
              <${Icon} name="right" />
            </button>
          </div>`} />

      <div class="streaks">
        ${TARGETS.map(([name, color], i) => html`
          <div class="streak">
            <span class="streak-name"><i class="dot" style=${{ background: color }} />${name} streak</span>
            <${Figure} value=${counts[i]} unit=${counts[i] === 1 ? ' day' : ' days'} />
          </div>`)}
      </div>

      <div class="grid">
        <div class="span-8 stack">
          <${Panel} title=${monthTitle(month)}
            actions=${html`<div class="legend">
              ${TARGETS.map(([name, color]) => html`<span><i class="dot" style=${{ background: color }} />${name}</span>`)}
            </div>`}>
            <${MonthGrid} days=${days} today=${today} selected=${selected} onPick=${d => pick(d.day)} />
          <//>

          <${Panel} title="Days">
            <table class="data-table days-table">
              <thead><tr><th>Day</th><th>Meals</th><th>Water</th><th>Steps</th><th>Meditation</th></tr></thead>
              <tbody>
                ${rows.map(d => html`
                  <tr key=${d.day} class=${d.day === selected ? 'selected' : ''} onClick=${() => pick(d.day)} tabIndex="0"
                      onKeyDown=${e => { if (e.key === 'Enter') pick(d.day); }}>
                    <td>${rowDate(d.day)}</td>
                    <td style=${{ color: d.dietMet ? TARGETS[0][1] : undefined }}>${d.mealsFollowed} / ${d.mealsTotal}</td>
                    <td style=${{ color: d.waterMet ? TARGETS[1][1] : undefined }}>${d.waterMl > 0 ? `${formatLitres(d.waterMl)} L` : '—'}</td>
                    <td style=${{ color: d.stepsMet ? TARGETS[2][1] : undefined }}>${d.steps != null ? nf.format(d.steps) : '—'}</td>
                    <td style=${{ color: d.meditationMet ? TARGETS[3][1] : undefined }}>${d.meditated || d.meditationMet ? 'Done' : '—'}</td>
                  </tr>`)}
              </tbody>
            </table>
          <//>
        </div>

        <div class="span-4 sticky-col">
          <${DayEditor} day=${selected} />
        </div>
      </div>
    </div>`;
}

function MonthGrid({ days, today, selected, onPick }) {
  // Monday-first, matching the program's week.
  const lead = dayOfWeek(days[0].day) - 1;
  return html`
    <div class="month">
      ${[1, 2, 3, 4, 5, 6, 7].map(n => html`<div class="weekday">${weekdayShort(n)}</div>`)}
      ${Array.from({ length: lead }, () => html`<div />`)}
      ${days.map(d => {
        const future = d.day > today;
        return html`
          <button type="button" disabled=${future} onClick=${() => onPick(d)}
                  class=${`day-cell score-${future ? 'x' : d.score} ${d.day === today ? 'today' : ''} ${d.day === selected ? 'selected' : ''}`}
                  aria-label=${`${longDate(d.day)}: ${d.score} of 4 targets`} aria-pressed=${d.day === selected}>
            <span class="day-num">${Number(d.day.slice(8))}</span>
            ${!future && html`
              <span class="marks">
                ${TARGETS.map(([, color, met]) => html`<i style=${{ background: met(d) ? color : 'transparent' }} />`)}
              </span>`}
          </button>`;
      })}
    </div>`;
}

/** Full editor for one past (or today's) day: the same controls as Today and Diet. */
function DayEditor({ day }) {
  const t = repo.dayTracker(day, settings().vegWeekdays);
  const actions = dayActions(day, () => t);
  return html`
    <${Panel} title=${longDate(day)} cls="day-editor">
      <div class="stack-tight">
        <${WaterControl} ml=${t.log.waterMl} onAdd=${actions.addWater} compact />
        <${StepsControl} log=${t.log} onSet=${actions.setManualSteps} inHistory />
        <${MeditationControl} done=${t.log.meditated} onSet=${actions.setMeditated} />
      </div>
      <div class="editor-section">
        <div class="row">
          <h3 class="grow">Meals, ${t.mealsFollowed} of ${t.mealsTotal}</h3>
          <${DayTypeSwitch} plan=${mealPlan} current=${t.dayType} onChange=${actions.setDayType} />
        </div>
        ${t.plan.slots.map(slot => html`
          <${MealTickRow} key=${slot.key} slot=${slot} day=${t} onSet=${(o, f) => actions.setMeal(slot.key, o, f)} />`)}
      </div>
      <div class="editor-section">
        <h3>Other habits</h3>
        ${repo.MANUAL_HABITS.map(i => html`
          <${CheckRow} label=${repo.HABIT_LABELS[i]} checked=${t.habits[i]} onToggle=${v => actions.toggleHabit(i, v)} />`)}
      </div>
    <//>`;
}
