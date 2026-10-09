import { useState } from 'preact/hooks';
import { longDate, todayIso } from '../dates.js';
import * as repo from '../repo.js';
import { settings } from '../settings.js';
import {
  AskAiButton, AskAiModal, CheckRow, Figure, MealTickRow, MeditationControl, PageHeader, Panel, ProgressBar,
  Stat, StepsControl, WaterControl,
} from './components.js';
import { formatKg, html, Icon } from './core.js';

/** Writes for one day, shared by Today, Diet and the History day editor. */
export const dayActions = (day, tracker) => ({
  addWater: ml => repo.addWater(day, ml),
  setMeditated: v => repo.setMeditated(day, v),
  setManualSteps: n => repo.setManualSteps(day, n),
  setDayType: t => repo.setDayType(day, t),
  toggleHabit: (i, v) => repo.toggleHabit(day, i, v),
  setMeal: (slotKey, option, followed) => repo.setMealFollowed(day, tracker().plan, slotKey, option, followed),
});

export function TodayScreen({ go }) {
  const [ask, setAsk] = useState(null);
  const s = settings();
  const today = todayIso();
  const pos = repo.positionFor(today, s.programStart);
  const plan = repo.planFor(pos);
  const session = repo.sessionFor(today);
  const sets = repo.setsForDay(today);
  const day = repo.dayTracker(today, s.vegWeekdays);
  const actions = dayActions(today, () => day);
  const nextKey = repo.nextSlotForNow(day);
  const targetsHit = [day.dietMet, day.habits[0], day.habits[1], day.habits[2]].filter(Boolean).length;

  return html`
    <div class="page">
      <${PageHeader} title=${longDate(today)}
        sub=${pos.isRestDay ? 'Rest day. Keep the habits going.' : `Week ${pos.week}, day ${pos.dayOfWeek} of the block`} />

      ${pos.planComplete && html`
        <div class="notice">
          <strong>The 6-week block is complete.</strong> Ask your coach for the next one. Until it
          arrives you can repeat week 6; it is logged as a repeat, not as new progression.
        </div>`}

      <div class="grid">
        <${SessionPanel} pos=${pos} plan=${plan} session=${session} sets=${sets} onOpen=${() => go('workout')} />
        <${WeightPanel} today=${today} goal=${s.goalWeightKg} />

        <${Panel} cls="span-12" title="Daily targets"
          actions=${html`<span class="score"><${Figure} value=${targetsHit} unit=" / 4 hit" tone=${targetsHit === 4 ? 'good' : ''} /></span>`}>
          <div class="targets">
            <div class="target">
              <div class="target-head">
                <span class="target-name">Diet</span>
                ${day.dietMet && html`<${Icon} name="check" size=${16} cls="good" label="Target hit" />`}
              </div>
              <${Figure} value=${day.mealsFollowed} unit=${` / ${day.mealsTotal} meals`} tone=${day.dietMet ? 'good' : ''} />
              <${ProgressBar} fraction=${day.mealsFollowed / day.mealsTotal} met=${day.dietMet} />
              <a class="text-button" href="#/diet">Open ${day.plan.label.toLowerCase()} plan</a>
            </div>
            <${WaterControl} ml=${day.log.waterMl} onAdd=${actions.addWater} />
            <${StepsControl} log=${day.log} onSet=${actions.setManualSteps} />
            <${MeditationControl} done=${day.log.meditated} onSet=${actions.setMeditated} />
          </div>
        <//>

        <${Panel} cls="span-7" title="Meals today"
          actions=${html`
            <span class="muted">${day.plan.label}</span>
            ${nextKey && html`<${AskAiButton} label="Ask about next meal" onClick=${() => {
              const slot = day.plan.slots.find(x => x.key === nextKey);
              const option = slot.options[day.optionIndex(slot.key)];
              setAsk({ kind: 'meal', title: slot.title.toLowerCase(), slot: slot.title, option: option.lines.join('\n') });
            }} />`}`}>
          <div class="meal-list">
            ${day.plan.slots.map(slot => html`
              <${MealTickRow} key=${slot.key} slot=${slot} day=${day} next=${slot.key === nextKey}
                onSet=${(o, f) => actions.setMeal(slot.key, o, f)} />`)}
          </div>
        <//>

        <div class="span-5 stack">
          <${Panel} title="Other habits">
            ${repo.MANUAL_HABITS.map(i => html`
              <${CheckRow} label=${repo.HABIT_LABELS[i]} checked=${day.habits[i]} onToggle=${v => actions.toggleHabit(i, v)} />`)}
          <//>
          ${repo.photosDueThisWeek(today) && html`
            <a class="panel callout" href="#/photos">
              <${Icon} name="camera" cls="accent" />
              <span class="grow">
                <strong>Weekly photos due</strong>
                <span class="muted block">Empty stomach, same clothes as day 1</span>
              </span>
              <${Icon} name="forward" />
            </a>`}
        </div>
      </div>
    </div>
    ${ask && html`<${AskAiModal} ctx=${ask} onClose=${() => setAsk(null)} />`}`;
}

function SessionPanel({ pos, plan, session, sets, onOpen }) {
  if (pos.isRestDay) {
    return html`
      <${Panel} cls="span-8 session rest">
        <div class="session-focus">Recover</div>
        <p class="muted">Sunday is off. No session scheduled; water, steps and sleep still count.</p>
      <//>`;
  }
  const totalSets = plan.reduce((n, e) => n + e.sets, 0);
  const finished = session?.finishedAt != null;
  return html`
    <${Panel} cls="span-8 session">
      <div class="session-top">
        <div class="grow">
          <div class="muted">Today's session</div>
          <div class="session-focus">${plan[0]?.focus.toLowerCase() ?? ''}</div>
        </div>
        <button type="button" class="filled-button big" onClick=${onOpen}>
          ${finished ? 'Review session' : sets.length ? 'Continue workout' : 'Start workout'}
        </button>
      </div>
      <div class="row gap-12">
        <${Figure} value=${sets.length} unit=${` / ${totalSets} sets`} tone=${finished ? 'good' : ''} />
        <div class="grow"><${ProgressBar} fraction=${totalSets ? sets.length / totalSets : 0} met=${finished} /></div>
        ${finished && html`<span class="good row gap-6"><${Icon} name="check" size=${18} /> Logged</span>`}
      </div>
      <ol class="session-list">
        ${plan.map(ex => {
          const done = sets.filter(x => x.exerciseName === ex.name).length;
          return html`
            <li class=${done >= ex.sets ? 'done' : ''}>
              <span class="ellipsis grow">${ex.name.toLowerCase()}</span>
              <span class="muted">${ex.reps}</span>
              <span class="set-count">${done}/${ex.sets}</span>
            </li>`;
        })}
      </ol>
    <//>`;
}

function WeightPanel({ today, goal }) {
  const weights = repo.weights();
  const latest = weights[weights.length - 1]?.kg ?? null;
  const start = weights[0]?.kg ?? null;
  const logged = weights.find(w => w.day === today)?.kg ?? null;
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const delta = latest != null && start != null ? latest - start : null;
  const save = () => {
    const kg = parseFloat(text.trim().replace(',', '.'));
    if (kg >= 30 && kg <= 250) { repo.setWeight(today, kg); setText(''); setError(null); }
    else setError('Enter a weight between 30 and 250 kg.');
  };
  return html`
    <${Panel} cls="span-4" title="Body weight">
      <div class="weight-body">
      <div class="stat-pair">
        <${Stat} label="Now" value=${latest != null ? formatKg(latest) : '—'} unit=" kg"
          sub=${delta != null ? `${delta <= 0 ? '' : '+'}${formatKg(delta)} kg since start` : null} />
        <${Stat} label="To goal" value=${latest != null ? formatKg(latest - goal) : '—'} unit=" kg"
          sub=${`Target ${formatKg(goal)} kg`} />
      </div>
      <form class="weigh-in" onSubmit=${e => { e.preventDefault(); save(); }}>
        <label class="field grow">
          <span>${logged != null ? `Logged ${formatKg(logged)} kg today. Change it:` : "Today's weigh-in"}</span>
          <input inputmode="decimal" placeholder="kg" value=${text} onInput=${e => setText(e.currentTarget.value)} />
        </label>
        <button class="tonal-button" type="submit" disabled=${!text.trim()}>${logged != null ? 'Update' : 'Log weight'}</button>
      </form>
      </div>
      ${error && html`<p class="error small">${error}</p>`}
    <//>`;
}
