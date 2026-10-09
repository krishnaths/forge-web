// Fixed program content: data/program.json (generated from the coach's workbook) and
// data/meal_plan.json. Both are copies of the Android app's assets; see README.

const REPS_RE = /(\d+)\s*\*\s*(\d+)/;

/** "3*15" -> 3 sets of 15; "3*30 SEC" is timed; "300 CLRS" (cardio) is one entry, no rep target. */
export function parseReps(reps) {
  const m = REPS_RE.exec(reps);
  const timed = /sec/i.test(reps);
  return m ? { sets: +m[1], repTarget: +m[2], timed } : { sets: 1, repTarget: 0, timed };
}

function muscleGroupsFor(name) {
  const has = s => name.includes(s);
  if (has('BENCH') || has('PECK') || has('FLY')) return 'Chest';
  if (has('PUSHDOWN') || has('KICKBACK') || (has('EXTENSION') && has('HEAD'))) return 'Triceps';
  if (has('ROW') || has('PULL DOWN') || has('LAT')) return 'Back';
  if (has('CURL') && !has('LEG')) return 'Biceps';
  if (has('SQUAT') || has('LUNGE') || has('LEG EXTENSION') || has('LEG CURL')) return 'Legs';
  if (has('SHOULDER') || has('LATERAL') || has('FACE PULL')) return 'Shoulders';
  if (has('CRUNCH') || has('PLANK') || has('LEG RISE')) return 'Core';
  if (has('CARDIO')) return 'Cardio';
  return 'General';
}

export let program = null;
export let mealPlan = null;

export async function loadProgram() {
  const [p, m] = await Promise.all([
    fetch('data/program.json').then(r => r.json()),
    fetch('data/meal_plan.json').then(r => r.json()),
  ]);

  const exercises = [];
  for (const week of p.program.weeks) {
    for (const day of week.days) {
      for (const ex of day.exercises) {
        const { sets, repTarget, timed } = parseReps(ex.reps);
        exercises.push({
          id: week.week * 10_000 + day.dayOfWeek * 100 + ex.order,
          week: week.week,
          dayOfWeek: day.dayOfWeek,
          focus: day.focus,
          sortOrder: ex.order,
          name: ex.name,
          reps: ex.reps,
          sets,
          repTarget,
          targetWeightKg: ex.targetWeightKg ?? null,
          youtubeId: ex.youtubeId ?? null,
          isCardio: !!ex.isCardio,
          isTimed: timed,
        });
      }
    }
  }

  const videos = p.exerciseLibrary
    .filter(v => v.youtubeId)
    .map(v => ({ name: v.name, youtubeId: v.youtubeId, muscleGroups: muscleGroupsFor(v.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Grouped by category, categories and items both sorted, as the phone's swap list is.
  const swapRows = [];
  for (const block of [p.diet.swaps ?? {}, p.diet.produce ?? {}]) {
    for (const [cat, items] of Object.entries(block)) {
      for (const item of items) swapRows.push([cat.toUpperCase(), item]);
    }
  }
  swapRows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const swaps = {};
  for (const [cat, item] of swapRows) (swaps[cat] ??= []).push(item);

  program = { version: p.version, exercises, videos, swaps, seed: p.seed };
  mealPlan = m;
}

export function dayPlan(week, dayOfWeek) {
  return program.exercises
    .filter(e => e.week === week && e.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export const focusFor = (week, dayOfWeek) => dayPlan(week, dayOfWeek)[0]?.focus ?? null;

/**
 * The coach left most later-week weights blank, expecting the athlete to carry over what they
 * last lifted. With no history either, fall back to the most recent week that did prescribe one.
 */
export function lastPrescribedWeight(name, uptoWeek) {
  return program.exercises
    .filter(e => e.name === name && e.targetWeightKg != null && e.week <= uptoWeek)
    .sort((a, b) => b.week - a.week)[0]?.targetWeightKg ?? null;
}

export const forType = key => mealPlan.dayTypes.find(t => t.key === key) ?? mealPlan.dayTypes[0];

/** The four daily targets. The numbers come from the coach; they are not user settings. */
export const Targets = { WATER_ML: 4000, STEPS: 12000, MEDITATION_MIN: 10 };
