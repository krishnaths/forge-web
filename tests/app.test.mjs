// node --test web/tests   (no dependencies)
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { addDays, addMonths, dayOfWeek, daysBetween, monthDays, weekStart } from '../js/dates.js';
import { parseReps } from '../js/program.js';
import { currentStreak, positionFor } from '../js/repo.js';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');

test('dates: arithmetic across months and DST', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30'); // EU DST switch
  assert.equal(daysBetween('2026-07-27', '2026-09-07'), 42);
  assert.equal(dayOfWeek('2026-08-03'), 1); // Monday
  assert.equal(dayOfWeek('2026-08-09'), 7); // Sunday
  assert.equal(weekStart('2026-08-09'), '2026-08-03');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(monthDays('2028-02').length, 29);
});

test('program position: weeks, rest day, and no invented week 7', () => {
  const start = '2026-07-27';
  assert.deepEqual(positionFor('2026-07-27', start), { week: 1, dayOfWeek: 1, cycle: 1, isRestDay: false, planComplete: false });
  assert.equal(positionFor('2026-08-09', start).isRestDay, true);
  assert.equal(positionFor('2026-09-06', start).week, 6);
  const after = positionFor('2026-09-07', start);
  assert.equal(after.week, 6);
  assert.equal(after.planComplete, true);
  assert.equal(positionFor('2026-07-01', start).week, 1); // before the block
});

test('streak: today not yet met does not break it', () => {
  const days = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']
    .map((day, i) => ({ day, met: i !== 3 }));
  assert.equal(currentStreak(days, '2026-10-09', d => d.met), 3);
  days[3].met = true;
  assert.equal(currentStreak(days, '2026-10-09', d => d.met), 4);
  days[1].met = false;
  assert.equal(currentStreak(days, '2026-10-09', d => d.met), 2);
});

test('reps parsing matches the phone', () => {
  assert.deepEqual(parseReps('3*15'), { sets: 3, repTarget: 15, timed: false });
  assert.deepEqual(parseReps('3*30 SEC'), { sets: 3, repTarget: 30, timed: true });
  assert.deepEqual(parseReps('300 CLRS'), { sets: 1, repTarget: 0, timed: false });
});

test('published data carries no personal block', () => {
  const program = JSON.parse(readFileSync(join(WEB, 'data/program.json'), 'utf8'));
  assert.equal(program.client, undefined);
  assert.equal(program.seed, undefined);
  assert.ok(program.program.weeks.length === 6);
});

test('service worker caches every file the app loads', () => {
  const sw = readFileSync(join(WEB, 'sw.js'), 'utf8');
  const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  for (const f of shell) if (f !== './') assert.ok(existsSync(join(WEB, f)), `listed but missing: ${f}`);
  const js = [...readdirSync(join(WEB, 'js')).map(f => `js/${f}`), ...readdirSync(join(WEB, 'js/ui')).map(f => `js/ui/${f}`)]
    .filter(f => f.endsWith('.js'));
  const fonts = readdirSync(join(WEB, 'vendor/fonts')).filter(f => f.endsWith('.woff2')).map(f => `vendor/fonts/${f}`);
  for (const f of [...js, ...fonts]) assert.ok(shell.includes(f), `not cached for offline: ${f}`);
});

test('sync writes exactly the Supabase schema columns', { skip: !existsSync(join(WEB, '../supabase')) && 'schema lives in the app repo' }, () => {
  const sql = readFileSync(join(WEB, '../supabase/migrations/0001_init.sql'), 'utf8');
  const js = readFileSync(join(WEB, 'js/sync.js'), 'utf8');
  for (const m of sql.matchAll(/create table if not exists public\.(\w+) \(([\s\S]*?)\n\);/g)) {
    const cols = m[2].split('\n').map(l => l.trim().split(/\s+/)[0]).filter(c => c && c !== 'primary' && !c.startsWith('--'));
    const block = js.split(`  ${m[1]}: {`)[1].split('fromRow')[0];
    const sent = [...block.matchAll(/(\w+):/g)].map(x => x[1]).filter(k => k !== 'conflict' && k !== 'toRow');
    assert.deepEqual([...sent].sort(), [...cols].sort(), m[1]);
  }
});
