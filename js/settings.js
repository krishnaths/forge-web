// Every knob the app has, per device, like the phone's DataStore. Not synced: reminder times and
// rest length are about this device, and the phone's settings never reach Supabase either.

const KEY = 'forge_settings';

export const DEFAULTS = {
  programStart: '2026-07-27',       // Week 1 Monday of the coach's block
  workoutReminderMinutes: 18 * 60,  // minutes from midnight, -1 = off
  weighInReminderMinutes: 7 * 60,
  photoReminderMinutes: 7 * 60 + 15, // Sunday
  waterReminderIntervalMinutes: 120, // 0 = off
  mealRemindersOn: true,
  restSeconds: 75,
  restTimerAutoStart: true,
  keepScreenOn: true,
  preferredAi: 'ASK',                // GEMINI / CHATGPT / ASK
  heightCm: 172,
  goalWeightKg: 75,
  vegWeekdays: [],                   // 1 = Mon .. 7 = Sun
};

const listeners = new Set();

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

let current = read();

export const settings = () => current;

export function update(patch) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage blocked */ }
  listeners.forEach(fn => fn(current));
}

export function onSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
