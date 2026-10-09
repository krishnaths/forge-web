// The phone's reminders, as far as a browser allows. A web page cannot wake itself up, so these
// fire only while Forge is open in a tab (or installed and running). Each one re-arms its next
// occurrence, and the same conditions apply: no workout ping on Sunday or after the session is
// finished, no weigh-in ping once today's weight is logged, no water ping once 4 L is in.

import { todayIso } from './dates.js';
import * as repo from './repo.js';
import { focusFor } from './program.js';
import { settings } from './settings.js';
import { notify } from './timer.js';

// Meal pings mirror the coach's slots, not arbitrary clock times.
export const MEAL_TIMES = [
  ['Breakfast', 8, 0], ['Lunch', 13, 0], ['Pre-workout', 17, 15],
  ['Post-workout', 19, 30], ['Dinner', 21, 0],
];

let timers = [];

function nextOccurrence(hour, minute, onlyDayOfWeek) {
  const now = new Date();
  const c = new Date(now);
  c.setHours(hour, minute, 0, 0);
  if (c <= now) c.setDate(c.getDate() + 1);
  if (onlyDayOfWeek) while (((c.getDay() + 6) % 7) + 1 !== onlyDayOfWeek) c.setDate(c.getDate() + 1);
  return c.getTime();
}

function at(when, fire, rearm) {
  // setTimeout overflows past ~24.8 days; nothing here is that far out.
  timers.push(setTimeout(() => { fire(); rearm(); }, Math.max(0, when - Date.now())));
}

export function rescheduleAll() {
  timers.forEach(clearTimeout);
  timers = [];
  const s = settings();
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const daily = (minutes, fire, dow) => {
    if (minutes < 0) return;
    const arm = () => at(nextOccurrence(Math.floor(minutes / 60), minutes % 60, dow), fire, arm);
    arm();
  };

  daily(s.workoutReminderMinutes, () => {
    const today = todayIso();
    const pos = repo.positionFor(today, s.programStart);
    if (pos.isRestDay || repo.sessionFor(today)?.finishedAt != null) return;
    notify(`Week ${pos.week} · ${focusFor(pos.week, pos.dayOfWeek) ?? 'Training'}`,
      'Your session is waiting. Tap to start.', '#/workout');
  });

  daily(s.weighInReminderMinutes, () => {
    if (repo.weights().some(w => w.day === todayIso())) return;
    notify('Morning weigh-in', 'Empty stomach, before water. Tap to log.', '#/today');
  });

  // Sunday only — the workbook wants one photo set a week.
  daily(s.photoReminderMinutes, () => {
    notify('Weekly progress photos', 'Empty stomach, same clothes as day 1. Front, back, side.', '#/photos');
  }, 7);

  if (s.waterReminderIntervalMinutes > 0) {
    const every = s.waterReminderIntervalMinutes * 60_000;
    const arm = () => at(Date.now() + every, () => {
      const t = repo.dayTracker(todayIso(), s.vegWeekdays);
      if (!t.habits[repo.HABIT_WATER]) notify('Water', 'Keep chipping at the 4 litres.', '#/today');
    }, arm);
    arm();
  }

  if (s.mealRemindersOn) {
    for (const [label, h, m] of MEAL_TIMES) {
      const arm = () => at(nextOccurrence(h, m), () => notify(label, 'Tap to see your options.', '#/diet'), arm);
      arm();
    }
  }
}
