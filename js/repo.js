// Everything the screens read and write, ported from the phone's ForgeRepository, DayTracker and
// view models so both apps make the same decisions from the same rows.

import * as db from './db.js';
import { addDays, dayOfWeek, daysBetween, monthDays, todayIso, weekStart } from './dates.js';
import { dayPlan, focusFor, forType, lastPrescribedWeight, mealPlan, program, Targets } from './program.js';

export const HABIT_COUNT = 6;
// Habits 0..2 are derived from daily_log and written through to habit_entry; 3..5 are ticked.
export const HABIT_WATER = 0;
export const HABIT_STEPS = 1;
export const HABIT_MEDITATION = 2;
export const MANUAL_HABITS = [3, 4, 5];
export const HABIT_LABELS = [
  '4L water', '12k steps', '10 min meditation',
  '7h sleep', 'Walk after meals', '10-15 min skipping',
];

export const STEPS_MANUAL = 'MANUAL';
export const STEPS_HEALTH_CONNECT = 'HEALTH_CONNECT';

const now = () => Date.now();

/** A row about to be rewritten locally: drop the marker that says it came from the cloud. */
const local = ({ _remote, ...row }) => row;

// ---------------------------------------------------------------- seeding

/**
 * The workbook's historical weights, habits and measurements, written once into an empty store and
 * stamped updatedAt 0, as the phone does. Anything synced from the cloud is newer and wins.
 * The public build strips that history from its copy of program.json (it is personal data on a
 * public site), so there it arrives from Supabase on sign-in instead.
 */
export async function seedIfNeeded() {
  if (db.meta('seededVersion')) return;
  const ops = [];
  if (db.isEmpty()) {
    for (const w of program.seed?.weight ?? []) {
      ops.push(['put', 'weight_entry', { day: w.date, kg: w.kg, updatedAt: 0 }]);
    }
    for (const h of program.seed?.habits ?? []) {
      h.flags.forEach((done, i) => {
        ops.push(['put', 'habit_entry', { day: h.date, habitIndex: i, done, updatedAt: 0 }]);
      });
    }
    for (const m of program.seed?.measurements ?? []) {
      ops.push(['put', 'measurement', {
        day: m.date,
        leftArm: m.leftArm ?? null, rightArm: m.rightArm ?? null,
        leftThigh: m.leftThigh ?? null, rightThigh: m.rightThigh ?? null,
        waistTop: m.waistTop ?? null, waistMiddle: m.waistMiddle ?? null, waistLower: m.waistLower ?? null,
        updatedAt: 0,
      }]);
    }
  }
  ops.push(['put', 'meta', { key: 'seededVersion', value: program.version }]);
  await db.write(ops);
}

// ---------------------------------------------------------------- program position

/**
 * Maps a date onto the 6-week block. Past day 42 it pins to week 6 and flags planComplete rather
 * than inventing a seventh week of progression the coach did not prescribe.
 */
export function positionFor(day, start) {
  const daysIn = daysBetween(start, day);
  const weeksIn = daysIn >= 0 ? Math.floor(daysIn / 7) : 0;
  const complete = weeksIn >= 6;
  const dow = dayOfWeek(day);
  return {
    week: complete ? 6 : weeksIn + 1,
    dayOfWeek: dow,
    cycle: Math.floor(weeksIn / 6) + 1,
    isRestDay: dow === 7,
    planComplete: complete,
  };
}

export const planFor = pos => (pos.isRestDay ? [] : dayPlan(pos.week, pos.dayOfWeek));

// ---------------------------------------------------------------- workout

export const sessionFor = day => db.get('workout_session', day) ?? null;
export const setsForDay = day =>
  db.all('set_log').filter(s => s.day === day)
    .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName) || a.setIndex - b.setIndex);

export async function startOrGetSession(day, pos) {
  const existing = sessionFor(day);
  if (existing) return existing;
  const session = {
    day, week: pos.week, dayOfWeek: pos.dayOfWeek,
    focus: focusFor(pos.week, pos.dayOfWeek) ?? 'REST',
    startedAt: now(), finishedAt: null, notes: '', updatedAt: now(),
  };
  await db.put('workout_session', session);
  return session;
}

/** Each set snapshots its own targets, so a new program block cannot rewrite history. */
export function logSet(session, exercise, setIndex, reps, weightKg) {
  return db.put('set_log', {
    day: session.day,
    exerciseName: exercise.name,
    setIndex,
    reps,
    weightKg,
    targetWeightKg: exercise.targetWeightKg,
    targetReps: exercise.repTarget,
    setsPrescribed: exercise.sets,
    completedAt: now(),
    updatedAt: now(),
  });
}

/** Undo a set. Leaves a tombstone so the deletion also reaches the cloud copy. */
export function clearSet(day, exerciseName, setIndex) {
  const key = `${day}|${exerciseName}|${setIndex}`;
  if (!db.get('set_log', key)) return Promise.resolve();
  return db.write([
    ['del', 'set_log', key],
    ['put', 'sync_tombstone', {
      id: now() * 1000 + Math.floor(Math.random() * 1000),
      tableName: 'set_log', day, keyText: exerciseName, keyInt: setIndex, deletedAt: now(),
    }],
  ]);
}

export function finishSession(day) {
  const s = sessionFor(day);
  if (!s) return Promise.resolve();
  const at = now();
  return db.put('workout_session', { ...local(s), finishedAt: at, updatedAt: at });
}

/**
 * What to prefill a set with, and where the number came from: the prescription, then the last
 * weight lifted for this movement, then the most recent week that prescribed one.
 */
export function suggestionFor(ex, week) {
  if (ex.isCardio) return { kg: 0, source: 'NONE' };
  if (ex.targetWeightKg != null) return { kg: ex.targetWeightKg, source: 'PRESCRIBED' };
  const last = lastWeightFor(ex.name);
  if (last != null && last > 0) return { kg: last, source: 'HISTORY' };
  const carried = lastPrescribedWeight(ex.name, week);
  if (carried != null) return { kg: carried, source: 'CARRIED_OVER' };
  return { kg: 0, source: 'NONE' };
}

function lastWeightFor(name) {
  const rows = db.all('set_log').filter(s => s.exerciseName === name)
    .sort((a, b) => b.day.localeCompare(a.day) || b.setIndex - a.setIndex);
  return rows[0]?.weightKg ?? null;
}

/** Heaviest set ever recorded for an exercise. */
export function personalBest(name) {
  return db.all('set_log').filter(s => s.exerciseName === name)
    .sort((a, b) => b.weightKg - a.weightKg || b.reps - a.reps)[0] ?? null;
}

/** Sets for an exercise before a day, newest day first. */
export function previousSets(name, beforeDay) {
  return db.all('set_log').filter(s => s.exerciseName === name && s.day < beforeDay)
    .sort((a, b) => b.day.localeCompare(a.day) || a.setIndex - b.setIndex);
}

/** Per-day tonnage (weight × reps), oldest first. */
export function volumeByDay() {
  const byDay = new Map();
  for (const s of db.all('set_log')) byDay.set(s.day, (byDay.get(s.day) ?? 0) + s.weightKg * s.reps);
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export const sessions = () => db.all('workout_session').sort((a, b) => a.day.localeCompare(b.day));
export const sets = () => db.all('set_log');

export const completedSessionCount = () =>
  db.all('workout_session').filter(s => s.finishedAt != null).length;

// ---------------------------------------------------------------- tracking

export const weights = () => db.all('weight_entry').sort((a, b) => a.day.localeCompare(b.day));

export const setWeight = (day, kg) => db.put('weight_entry', { day, kg, updatedAt: now() });

export const toggleHabit = (day, habitIndex, done) =>
  db.put('habit_entry', { day, habitIndex, done, updatedAt: now() });

export const measurements = () => db.all('measurement').sort((a, b) => a.day.localeCompare(b.day));

export const saveMeasurement = m => db.put('measurement', { ...m, updatedAt: now() });

// ---------------------------------------------------------------- daily targets

const emptyDay = day => ({
  day, dayType: null, waterMl: 0, steps: null, stepsSource: null, meditated: false, updatedAt: 0,
});

const DERIVED = [
  [HABIT_WATER, d => d.waterMl >= Targets.WATER_ML],
  [HABIT_STEPS, d => (d.steps ?? 0) >= Targets.STEPS],
  [HABIT_MEDITATION, d => d.meditated],
];

const sameDay = (a, b) => a.dayType === b.dayType && a.waterMl === b.waterMl && a.steps === b.steps
  && a.stepsSource === b.stepsSource && a.meditated === b.meditated;

/**
 * Read-modify-write of one day's row plus its derived habit flags, in one batch. A derived habit is
 * only written when its value actually changes, so editing an old day imported from the workbook
 * does not wipe that day's imported water flag just because the workbook never recorded litres.
 */
function editDay(day, change) {
  const old = db.get('daily_log', day) ?? emptyDay(day);
  const next = change(old);
  if (sameDay(old, next)) return Promise.resolve();
  const at = now();
  const ops = [['put', 'daily_log', { ...local(next), day, updatedAt: at }]];
  for (const [habitIndex, met] of DERIVED) {
    if (met(old) !== met(next)) {
      ops.push(['put', 'habit_entry', { day, habitIndex, done: met(next), updatedAt: at }]);
    }
  }
  return db.write(ops);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const addWater = (day, deltaMl) =>
  editDay(day, d => ({ ...d, waterMl: clamp(d.waterMl + deltaMl, 0, 10_000) }));

export const setMeditated = (day, done) => editDay(day, d => ({ ...d, meditated: done }));

/** A typed number. null clears it (on the phone, that hands the day back to Health Connect). */
export const setManualSteps = (day, count) => editDay(day, d => (count == null
  ? { ...d, steps: null, stepsSource: null }
  : { ...d, steps: clamp(count, 0, 200_000), stepsSource: STEPS_MANUAL }));

export const setDayType = (day, dayType) => editDay(day, d => ({ ...d, dayType }));

export function setMealFollowed(day, plan, slotKey, optionIndex, followed) {
  const slot = plan.slots.find(s => s.key === slotKey);
  if (!slot) return Promise.resolve();
  const option = slot.options[optionIndex] ?? slot.options[0];
  return db.put('meal_log', {
    day, slotKey: slot.key, slotTitle: slot.title, dayType: plan.key,
    optionIndex, optionTitle: option.title, followed, updatedAt: now(),
  });
}

export const mealLogs = (from, to) => db.all('meal_log').filter(m => m.day >= from && m.day <= to);

/** A day's explicit choice wins; otherwise the weekday default from Settings. */
export const resolveDayType = (explicit, day, vegWeekdays) =>
  explicit ?? (vegWeekdays.includes(dayOfWeek(day)) ? 'VEG' : 'NONVEG');

/** Everything about one day's targets: what Today, Diet and the History sheet edit. */
export function dayTracker(day, vegWeekdays) {
  const log = db.get('daily_log', day) ?? emptyDay(day);
  const plan = forType(resolveDayType(log.dayType, day, vegWeekdays));
  const meals = {};
  for (const m of db.all('meal_log')) if (m.day === day) meals[m.slotKey] = m;
  const habits = Array.from({ length: HABIT_COUNT }, (_, i) =>
    db.get('habit_entry', `${day}|${i}`)?.done === true);
  const followed = key => meals[key]?.followed === true;
  const mealsFollowed = plan.slots.filter(s => followed(s.key)).length;
  return {
    day, log, plan, meals, habits,
    dayType: plan.key,
    mealsFollowed,
    mealsTotal: plan.slots.length,
    dietMet: plan.slots.length > 0 && mealsFollowed === plan.slots.length,
    followed,
    // The option last recorded for a slot, even if since unticked, so the chip stays put.
    optionIndex: key => meals[key]?.optionIndex ?? 0,
  };
}

/** Slots in eating order, each with the hour by which it is normally eaten. */
const SLOT_DUE_BY = [
  [10, 'BREAKFAST'], [12, 'SNACK'], [15, 'LUNCH'],
  [18, 'PRE_WORKOUT'], [20, 'POST_WORKOUT'], [24, 'DINNER'],
];

/**
 * The meal Today offers to tick: the earliest slot due by now and still unticked, so a forgotten
 * lunch is asked about before dinner. Once everything due is ticked, the next one.
 */
export function nextSlotForNow(t) {
  const hour = new Date().getHours();
  const due = SLOT_DUE_BY.filter(([, key]) => t.plan.slots.some(s => s.key === key));
  const order = due.map(([, key]) => key);
  const dueCount = due.findIndex(([h]) => hour < h) + 1;
  return order.slice(0, dueCount).find(k => !t.followed(k))
    ?? order.slice(dueCount).find(k => !t.followed(k)) ?? null;
}

// ---------------------------------------------------------------- history

/** One cell of the History calendar per day from..to. */
export function summarise(from, to, vegWeekdays) {
  const logs = new Map();
  const meals = new Map();
  const habits = new Map();
  for (const l of db.all('daily_log')) if (l.day >= from && l.day <= to) logs.set(l.day, l);
  for (const m of db.all('meal_log')) {
    if (m.day >= from && m.day <= to) (meals.get(m.day) ?? meals.set(m.day, []).get(m.day)).push(m);
  }
  for (const h of db.all('habit_entry')) {
    if (h.day >= from && h.day <= to) (habits.get(h.day) ?? habits.set(h.day, []).get(h.day)).push(h);
  }
  const out = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const log = logs.get(day);
    const plan = forType(resolveDayType(log?.dayType ?? null, day, vegWeekdays));
    const dayMeals = meals.get(day) ?? [];
    const dayHabits = habits.get(day) ?? [];
    const flags = Array.from({ length: HABIT_COUNT }, (_, i) =>
      dayHabits.find(h => h.habitIndex === i)?.done === true);
    const mealsFollowed = plan.slots.filter(s => dayMeals.some(m => m.slotKey === s.key && m.followed)).length;
    const d = {
      day,
      dayType: plan.key,
      mealsFollowed,
      mealsTotal: plan.slots.length,
      waterMl: log?.waterMl ?? null,
      steps: log?.steps ?? null,
      meditated: log?.meditated === true,
      habits: flags,
      dietMet: plan.slots.length > 0 && mealsFollowed >= plan.slots.length,
      waterMet: flags[HABIT_WATER],
      stepsMet: flags[HABIT_STEPS],
      meditationMet: flags[HABIT_MEDITATION],
    };
    d.score = [d.dietMet, d.waterMet, d.stepsMet, d.meditationMet].filter(Boolean).length;
    out.push(d);
  }
  return out;
}

export const monthSummaries = (ym, vegWeekdays) => {
  const days = monthDays(ym);
  return summarise(days[0], days[days.length - 1], vegWeekdays);
};

/**
 * Current run of consecutive days meeting `met`, ending today. Today not yet met does not break
 * the streak — the day is not over — so counting starts from yesterday in that case.
 */
export function currentStreak(days, today, met) {
  const byDay = new Map(days.map(d => [d.day, d]));
  let cursor = byDay.get(today) && met(byDay.get(today)) ? today : addDays(today, -1);
  let streak = 0;
  while (byDay.get(cursor) && met(byDay.get(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function streaks(vegWeekdays) {
  const today = todayIso();
  const days = summarise(addDays(today, -365), today, vegWeekdays);
  return {
    diet: currentStreak(days, today, d => d.dietMet),
    water: currentStreak(days, today, d => d.waterMet),
    steps: currentStreak(days, today, d => d.stepsMet),
    meditation: currentStreak(days, today, d => d.meditationMet),
  };
}

/** Days with at least one habit ticked, oldest first, each with its six flags. */
export function habitDays() {
  const byDay = new Map();
  for (const h of db.all('habit_entry')) {
    if (!h.done) continue;
    const flags = byDay.get(h.day) ?? byDay.set(h.day, Array(HABIT_COUNT).fill(false)).get(h.day);
    flags[h.habitIndex] = true;
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// ---------------------------------------------------------------- photos (never synced)

export const photos = () => db.all('progress_photo')
  .sort((a, b) => b.day.localeCompare(a.day) || a.angle.localeCompare(b.angle));

export const photosDueThisWeek = today => !photos().some(p => p.day >= weekStart(today));

/** One photo per angle per day; a retake replaces the blob under the same key. */
export async function registerPhoto(day, angle, blob) {
  const key = `${day}|${angle}`;
  await db.putBlob(key, blob);
  await db.put('progress_photo', { day, angle, capturedAt: now() });
}

export async function deletePhoto(p) {
  const key = `${p.day}|${p.angle}`;
  await db.deleteBlob(key);
  await db.write([['del', 'progress_photo', key]]);
}

export { mealPlan };
