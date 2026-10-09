// Calendar days travel as ISO strings ("2026-08-03"), the same shape Supabase stores, so a local
// row and its remote copy share one key. All arithmetic goes through UTC so DST never shifts a day.

const pad = n => String(n).padStart(2, '0');

export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayIso = () => iso(new Date());

const utc = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };

export function addDays(s, n) {
  const d = new Date(utc(s) + n * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / 86_400_000);

/** 1 = Monday .. 7 = Sunday, like java.time.DayOfWeek. */
export const dayOfWeek = s => { const d = new Date(utc(s)).getUTCDay(); return d === 0 ? 7 : d; };

export const weekStart = s => addDays(s, 1 - dayOfWeek(s));

/** "YYYY-MM" for a month, and the days in it. */
export const monthOf = s => s.slice(0, 7);

export function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
}

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

const fmt = (s, opts) => parse(s).toLocaleDateString(undefined, opts);
export const longDate = s => fmt(s, { weekday: 'long', day: 'numeric', month: 'long' });
export const rowDate = s => fmt(s, { weekday: 'short', day: 'numeric' });
export const monthTitle = ym => fmt(`${ym}-01`, { month: 'long', year: 'numeric' });
export const shortDate = s => fmt(s, { day: 'numeric', month: 'short', year: 'numeric' });
export const weekdayShort = n => fmt(addDays('2026-08-03', n - 1), { weekday: 'short' }); // 2026-08-03 is a Monday
export const weekdayNarrow = n => fmt(addDays('2026-08-03', n - 1), { weekday: 'narrow' });
