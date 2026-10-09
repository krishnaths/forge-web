import { useEffect, useRef, useState } from 'preact/hooks';
import { todayIso } from '../dates.js';
import * as repo from '../repo.js';
import { settings } from '../settings.js';
import * as timer from '../timer.js';
import { AskAiButton, AskAiModal, Figure, InlineVideo, NumberStepper, PageHeader, ProgressBar } from './components.js';
import { formatKg, html, Icon, titleCase, toast } from './core.js';

// Which exercise is open survives switching pages, like the phone's view model.
let activeIndex = 0;
let activeDay = null;

const SOURCE_TEXT = { PRESCRIBED: 'Target', HISTORY: 'Last time', CARRIED_OVER: 'Carried over' };

export function WorkoutScreen() {
  const [, rerender] = useState(0);
  const [ask, setAsk] = useState(null);
  const s = settings();
  const today = todayIso();
  const pos = repo.positionFor(today, s.programStart);
  const plan = repo.planFor(pos);
  const sets = repo.setsForDay(today);
  const session = repo.sessionFor(today);

  if (activeDay !== today) { activeDay = today; activeIndex = 0; }
  const setActive = i => { activeIndex = Math.max(0, Math.min(plan.length - 1, i)); rerender(n => n + 1); };

  useWakeLock(s.keepScreenOn && !pos.isRestDay);

  // ↑ / ↓ move between exercises when nothing else has focus.
  useEffect(() => {
    const onKey = e => {
      if (document.querySelector('.scrim') || !isIdle(e.target)) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  if (pos.isRestDay) {
    return html`
      <div class="page">
        <${PageHeader} title="Rest day" sub="Sunday is off. Recovery is part of the program." />
        <div class="empty-state">
          <p>No session today. Water, steps and sleep still count.</p>
          <a class="text-button" href="#/library">Browse the exercise library</a>
        </div>
      </div>`;
  }

  const active = plan[activeIndex];
  const focus = plan[0]?.focus ?? '';
  const totalSets = plan.reduce((n, e) => n + e.sets, 0);
  const finished = session?.finishedAt != null;

  const complete = async (ex, setIndex, reps, weight) => {
    const current = await repo.startOrGetSession(today, pos);
    await repo.logSet(current, ex, setIndex, reps, weight);
    if (s.restTimerAutoStart && !ex.isCardio) timer.start(ex.name, setIndex, s.restSeconds);
  };

  const finish = async () => {
    await repo.startOrGetSession(today, pos);
    await repo.finishSession(today);
    timer.cancel();
    toast('Session logged');
  };

  return html`
    <div class="page">
      <${PageHeader} title=${titleCase(focus)} sub=${`Week ${pos.week}, ${plan.length} exercises`}
        actions=${html`
          <a class="outlined-button" href="#/library">Exercise library</a>
          <button type="button" class=${finished ? 'tonal-button' : 'filled-button'} onClick=${finish}>
            ${finished ? 'Session logged' : 'Finish session'}
          </button>`} />

      <div class="workout">
        <aside class="exercise-list panel" aria-label="Exercises">
          <div class="exercise-list-head">
            <${Figure} value=${sets.length} unit=${` / ${totalSets} sets`} tone=${finished ? 'good' : ''} />
            <${ProgressBar} fraction=${totalSets ? sets.length / totalSets : 0} met=${finished} thin />
          </div>
          <ol>
            ${plan.map((ex, i) => {
              const done = sets.filter(x => x.exerciseName === ex.name).length;
              const complete = done >= ex.sets;
              return html`
                <li>
                  <button type="button" class=${`exercise-item ${i === activeIndex ? 'active' : ''} ${complete ? 'done' : ''}`}
                          aria-current=${i === activeIndex ? 'step' : undefined} onClick=${() => setActive(i)}>
                    <span class="exercise-num">${complete ? html`<${Icon} name="check" size=${16} />` : i + 1}</span>
                    <span class="grow">
                      <span class="exercise-name">${ex.name.toLowerCase()}</span>
                      <span class="muted small block">${ex.reps}</span>
                    </span>
                    <span class="set-count">${done}/${ex.sets}</span>
                  </button>
                </li>`;
            })}
          </ol>
        </aside>

        <div class="exercise-detail">
          <${RestTimer} />
          ${active && html`
            <${ActiveExercise}
              key=${`${active.id}-${sets.filter(x => x.exerciseName === active.name).map(x => x.setIndex).join(',')}`}
              exercise=${active} index=${activeIndex} total=${plan.length}
              logged=${sets.filter(x => x.exerciseName === active.name)}
              suggestion=${repo.suggestionFor(active, pos.week)}
              restSeconds=${s.restSeconds} autoRest=${s.restTimerAutoStart}
              onComplete=${(i, reps, w) => complete(active, i, reps, w)}
              onUndo=${i => repo.clearSet(today, active.name, i)}
              onAsk=${() => setAsk({
                kind: 'exercise', title: active.name.toLowerCase(), name: active.name, reps: active.reps,
                targetWeightKg: active.targetWeightKg, focus,
              })}
              onPrev=${activeIndex > 0 ? () => setActive(activeIndex - 1) : null}
              onNext=${activeIndex < plan.length - 1 ? () => setActive(activeIndex + 1) : null} />`}
        </div>
      </div>
    </div>
    ${ask && html`<${AskAiModal} ctx=${ask} onClose=${() => setAsk(null)} />`}`;
}

const isIdle = el => !el?.closest || el === document.body || !el.closest('input, textarea, select, button, a, [contenteditable]');

function ActiveExercise({
  exercise, index, total, logged, suggestion, restSeconds, autoRest, onComplete, onUndo, onAsk, onPrev, onNext,
}) {
  // The first free index, not logged.length: after undoing set 1 of 3, the next set is set 1
  // again, rather than one that overwrites set 3.
  let nextSetIndex = 0;
  while (logged.some(x => x.setIndex === nextSetIndex)) nextSetIndex++;
  const allDone = logged.length >= exercise.sets;
  // Prefilled with the prescription, and with the last set's actuals once the user has deviated,
  // so the common case is zero adjustments before completing.
  const last = logged.reduce((a, b) => (!a || b.setIndex > a.setIndex ? b : a), null);
  const [weight, setWeight] = useState(last?.weightKg ?? suggestion?.kg ?? exercise.targetWeightKg ?? 0);
  const [reps, setReps] = useState(last?.reps ?? exercise.repTarget);
  const state = useRef();
  state.current = { weight, reps };
  const completeNow = () => {
    navigator.vibrate?.(30);
    onComplete(nextSetIndex, state.current.reps, state.current.weight);
  };

  // Enter completes the set (or moves on once all are done) when focus is not in a form control.
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Enter' || document.querySelector('.scrim') || !isIdle(e.target)) return;
      e.preventDefault();
      if (!allDone) completeNow();
      else onNext?.();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const hint = SOURCE_TEXT[suggestion?.source];
  const rows = Array.from({ length: Math.max(exercise.sets, ...logged.map(x => x.setIndex + 1)) }, (_, i) => i);
  const unit = exercise.isTimed ? 's' : ' reps';

  return html`
    <section class="panel active-exercise" aria-label=${exercise.name}>
      <div class="active-head">
        <div class="grow">
          <div class="muted">Exercise ${index + 1} of ${total}</div>
          <h2 class="exercise-title">${exercise.name.toLowerCase()}</h2>
          <div class="prescription">
            <span><strong>${exercise.reps}</strong> prescribed</span>
            ${hint && html`<span>${hint} <strong>${formatKg(suggestion.kg)} kg</strong></span>`}
          </div>
        </div>
        <div class="row gap-6">
          <button type="button" class="icon-button" disabled=${!onPrev} onClick=${onPrev} aria-label="Previous exercise" title="Previous (↑)"><${Icon} name="left" /></button>
          <button type="button" class="icon-button" disabled=${!onNext} onClick=${onNext} aria-label="Next exercise" title="Next (↓)"><${Icon} name="right" /></button>
        </div>
      </div>

      <div class="active-body">
        <div class="logging">
          <table class="set-table">
            <thead><tr><th>Set</th><th>${exercise.isTimed ? 'Time' : 'Reps'}</th><th>Weight</th><th /></tr></thead>
            <tbody>
              ${rows.map(i => {
                const x = logged.find(l => l.setIndex === i);
                if (x) {
                  return html`
                    <tr class="logged">
                      <td><${Icon} name="check" size=${16} cls="good" /> ${i + 1}</td>
                      <td>${x.reps}${unit}</td>
                      <td class="num">${x.weightKg > 0 ? `${formatKg(x.weightKg)} kg` : 'Bodyweight'}</td>
                      <td><button type="button" class="text-button" onClick=${() => onUndo(i)}>Undo</button></td>
                    </tr>`;
                }
                return html`
                  <tr class=${i === nextSetIndex && !allDone ? 'current' : 'pending'}>
                    <td>${i + 1}</td>
                    <td class="muted">${exercise.repTarget ? `${exercise.repTarget}${unit}` : '—'}</td>
                    <td class="muted">${i === nextSetIndex ? 'Up next' : ''}</td>
                    <td />
                  </tr>`;
              })}
            </tbody>
          </table>

          ${!allDone
            ? html`
              <div class="set-entry">
                <div class="set-entry-title">Set ${nextSetIndex + 1} of ${exercise.sets}</div>
                ${!exercise.isCardio && html`
                  <${NumberStepper} label="Weight" value=${weight} onChange=${setWeight} step=${2.5} suffix="kg" decimals=${1} />`}
                <${NumberStepper} label=${exercise.isTimed ? 'Seconds' : 'Reps'} value=${reps} onChange=${setReps} />
                <button type="button" class="filled-button big wide" onClick=${completeNow}>
                  ${autoRest && !exercise.isCardio ? `Complete set and rest ${restSeconds}s` : 'Complete set'}
                </button>
                <p class="muted small kbd-hint"><kbd>Enter</kbd> completes the set. <kbd>↑</kbd> <kbd>↓</kbd> switch exercise.</p>
              </div>`
            : html`
              <div class="set-entry done">
                <div class="row gap-6 good"><${Icon} name="check" /> All ${exercise.sets} sets logged</div>
                ${onNext && html`<button type="button" class="filled-button good-button big wide" onClick=${onNext}>Next exercise</button>`}
              </div>`}
        </div>

        <div class="form-guide">
          ${exercise.youtubeId && html`<${InlineVideo} id=${exercise.youtubeId} />`}
          <${AskAiButton} onClick=${onAsk} label="Ask about form" />
        </div>
      </div>
    </section>`;
}

/** Rest countdown. Ticks locally against the stored deadline; writes nothing per tick. */
function RestTimer() {
  const [t, setT] = useState(timer.active());
  const [, tick] = useState(0);
  useEffect(() => timer.onTimer(setT), []);
  useEffect(() => {
    if (!t) return undefined;
    const id = setInterval(() => tick(n => n + 1), 250);
    return () => clearInterval(id);
  }, [t]);
  if (!t) return null;
  const left = timer.remainingSeconds(t);
  return html`
    <div class="rest-timer" role="timer">
      <div class="grow">
        <div>Rest after ${t.exerciseName.toLowerCase()}, set ${t.setIndex + 1}</div>
        <${ProgressBar} fraction=${left / t.durationSeconds} thin />
      </div>
      <span class="rest-clock">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>
      <button type="button" class="text-button" onClick=${() => timer.addSeconds(30)}>+30s</button>
      <button type="button" class="filled-button" onClick=${timer.cancel}>Skip rest</button>
    </div>`;
}

/** Keeps the screen awake while this page is open, where the browser supports it. */
function useWakeLock(on) {
  useEffect(() => {
    if (!on || !navigator.wakeLock) return undefined;
    let lock = null;
    const acquire = () => {
      if (document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen').then(l => { lock = l; }, () => {});
      }
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      lock?.release();
    };
  }, [on]);
}
