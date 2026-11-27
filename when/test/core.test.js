// Run with: node --test when/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

const iso = ms => new Date(ms).toISOString().slice(0, 16);

test('wall clock to instant, across daylight saving', () => {
  assert.equal(iso(C.zonedToMs('2026-11-24', 9 * 60, 'America/New_York')), '2026-11-24T14:00'); // EST
  assert.equal(iso(C.zonedToMs('2026-07-01', 9 * 60, 'America/New_York')), '2026-07-01T13:00'); // EDT
  assert.equal(iso(C.zonedToMs('2026-11-01', 0, 'America/New_York')), '2026-11-01T04:00');      // fall-back day
  assert.equal(iso(C.zonedToMs('2026-11-01', 3 * 60, 'America/New_York')), '2026-11-01T08:00');
  assert.equal(iso(C.zonedToMs('2026-03-08', 3 * 60, 'America/New_York')), '2026-03-08T07:00'); // after spring-forward
  assert.equal(iso(C.zonedToMs('2026-11-24', 9 * 60, 'Asia/Kolkata')), '2026-11-24T03:30');
  assert.equal(iso(C.zonedToMs('2026-11-24', 0, 'UTC')), '2026-11-24T00:00');
});

test('parts of an instant in a zone', () => {
  const p = C.partsIn(Date.UTC(2026, 10, 24, 4, 30), 'America/Los_Angeles');
  assert.deepEqual([p.date, p.min, p.wd], ['2026-11-23', 20 * 60 + 30, 1]);
  const q = C.partsIn(Date.UTC(2026, 10, 24, 5, 0), 'America/New_York'); // midnight exactly
  assert.deepEqual([q.date, q.h, q.min], ['2026-11-24', 0, 0]);
});

test('slots and their order', () => {
  const ev = { mode: 'dates', days: ['2026-11-25', '2026-11-24'], start: 540, end: 660, step: 30, tz: 'America/New_York' };
  const keys = C.slotKeys(ev);
  assert.equal(keys.length, 8);
  assert.equal(iso(keys[0] * 60000), '2026-11-24T14:00');
  assert.ok(keys.every((k, i) => i === 0 || k > keys[i - 1]));
});

test('a day with its own times', () => {
  const ev = { mode: 'dates', days: ['2026-11-24', '2026-11-25'], start: 540, end: 660, step: 30, tz: 'UTC', hours: { '2026-11-25': [780, 900] } };
  assert.deepEqual(C.hoursFor(ev, '2026-11-24'), [540, 660]);
  assert.deepEqual(C.hoursFor(ev, '2026-11-25'), [780, 900]);
  assert.equal(C.slotCount(ev), 8);
  const keys = C.slotKeys(ev);
  assert.equal(iso(keys[4] * 60000), '2026-11-25T13:00');
  const lay = C.layout(ev, 'UTC');
  assert.deepEqual(lay.rows.map(r => r.min), [540, 570, 600, 630, 780, 810, 840, 870]);
  assert.ok(lay.rows[4].gap);
  assert.equal(lay.grid[0][4], null); // the 24th has nothing in the afternoon
  assert.equal(lay.grid[1][0], null); // the 25th has nothing in the morning
  // a bad entry falls back to the general window
  assert.deepEqual(C.hoursFor({ ...ev, hours: { '2026-11-25': [900, 780] } }, '2026-11-25'), [540, 660]);
});

test('the same poll laid out in the organizer zone and in another zone', () => {
  const ev = { mode: 'dates', days: ['2026-11-24', '2026-11-25'], start: 18 * 60, end: 23 * 60, step: 60, tz: 'America/New_York' };
  const home = C.layout(ev, 'America/New_York');
  assert.equal(home.cols.length, 2);
  assert.deepEqual(home.rows.map(r => r.min), [1080, 1140, 1200, 1260, 1320]);
  assert.ok(home.grid.every(col => col.every(k => k != null)));

  // London is 5 hours ahead: 6 PM - 11 PM becomes 11 PM - 4 AM and spills into the next day
  const ldn = C.layout(ev, 'Europe/London');
  assert.deepEqual(ldn.cols.map(c => c.date), ['2026-11-24', '2026-11-25', '2026-11-26']);
  assert.deepEqual(ldn.rows.map(r => r.min), [0, 60, 120, 180, 1380]);
  assert.deepEqual(ldn.rows.map(r => r.gap), [false, false, false, false, true]);
  assert.equal(ldn.grid[0][4] != null, true);   // Nov 24, 11 PM
  assert.equal(ldn.grid[0][0], null);           // Nov 24, midnight is not in the poll
  assert.equal(ldn.pos.size, 10);
});

test('half-hour zones get their own rows', () => {
  const ev = { mode: 'dates', days: ['2026-11-24'], start: 9 * 60, end: 11 * 60, step: 60, tz: 'America/New_York' };
  const ind = C.layout(ev, 'Asia/Kolkata');
  assert.deepEqual(ind.rows.map(r => r.min), [19 * 60 + 30, 20 * 60 + 30]);
});

test('weekly polls are laid out by weekday and wrap around the week', () => {
  const days = C.weekDates([0, 1], '2026-11-25'); // Sunday and Monday of that week
  assert.deepEqual(days, ['2026-11-22', '2026-11-23']);
  const ev = { mode: 'week', days, start: 22 * 60, end: 24 * 60, step: 60, tz: 'America/New_York' };
  const tokyo = C.layout(ev, 'Asia/Tokyo', 0); // 14 hours ahead: Sun 10 PM -> Mon noon
  assert.deepEqual(tokyo.cols.map(c => c.wd), [1, 2]);
  assert.deepEqual(tokyo.rows.map(r => r.min), [12 * 60, 13 * 60]);
  const monFirst = C.layout({ ...ev, tz: 'UTC' }, 'UTC', 1);
  assert.deepEqual(monFirst.cols.map(c => c.wd), [1, 0]);
});

test('next real occurrence of a weekly time', () => {
  const ev = { days: ['2026-11-23'], tz: 'America/New_York' };
  const start = Math.round(C.zonedToMs('2026-11-23', 10 * 60, ev.tz) / 60000);
  const now = Date.UTC(2027, 5, 10); // a Thursday in June, during daylight saving
  const [s, e] = C.nextWeekly(start, start + 60, ev.tz, now);
  const p = C.partsIn(s * 60000, ev.tz);
  assert.equal(p.wd, 1);
  assert.equal(p.min, 600); // still 10:00 local after the clocks changed
  assert.ok(s * 60000 > now && s * 60000 - now < 7 * 86400000);
  assert.equal(e - s, 60);
});

test('labels', () => {
  assert.equal(C.clock(9 * 60, false, 'en-US'), '9:00 AM');
  assert.equal(C.clock(13 * 60, true, 'en-US'), '1 PM');
  assert.equal(C.clock(13 * 60 + 30, true, 'en-US'), '1:30 PM');
  assert.equal(C.tzLabel('America/New_York', Date.UTC(2026, 10, 24)), 'New York (GMT-5)');
  assert.equal(C.tzLabel('Asia/Kolkata', Date.UTC(2026, 10, 24)), 'Kolkata (GMT+5:30)');
  const s = Math.round(Date.UTC(2026, 10, 25, 19, 0) / 60000);
  const r = C.rangeLabel(s, s + 90, 'America/New_York', 'dates', 'en-US');
  assert.equal(r.day, 'Wednesday, November 25');
  assert.match(r.time, /^2:00\s?–\s?3:30\sPM$/);
  const late = Math.round(Date.UTC(2026, 10, 24, 14, 0) / 60000); // 11 PM in Tokyo
  assert.equal(C.rangeLabel(late, late + 60, 'Asia/Tokyo', 'dates', 'en-US').time.replace(/\s/g, ' '), '11:00 PM – 12:00 AM');
  assert.match(C.rangeLabel(late, late + 120, 'Asia/Tokyo', 'dates', 'en-US').time, /^11:00\sPM – Wed, Nov 25, 1:00\sAM$/);
  assert.equal(C.daysSummary({ mode: 'dates', days: ['2026-11-24', '2026-11-30', '2026-11-25'] }, 'en-US'), 'Nov 24 – Nov 30 (3 days)');
});

test('best times favour required people, then the most free, counting if-needed as half', () => {
  const ev = { mode: 'dates', days: ['2026-11-24'], start: 540, end: 720, step: 60, tz: 'UTC', required: [] };
  const [a, b, c] = C.slotKeys(ev); // 9, 10, 11
  const people = [
    { id: 'p1', name: 'Ana', avail: [a, b], maybe: [] },
    { id: 'p2', name: 'Ben', avail: [a, b], maybe: [c] },
    { id: 'p3', name: 'Cy', avail: [c], maybe: [b] }
  ];
  const best = C.bestTimes(ev, people);
  assert.equal(best[0].start, b);            // 10:00: two free plus Cy if needed (2.5)
  assert.equal(best[0].end, b + 60);
  assert.deepEqual(best[0].maybe, ['p3']);
  assert.equal(best[1].start, a);            // 9:00: two free (2)
  assert.deepEqual(best[1].no, ['p3']);

  const withReq = C.bestTimes({ ...ev, required: ['p3'] }, people);
  assert.equal(withReq[0].start, b);         // Cy can do 10 if needed, so that still wins
  assert.equal(withReq.find(x => x.start === a).missingReq, 1);
  assert.notEqual(withReq[1].start, a);      // 9:00 drops below 11:00 because Cy is missing
});

test('back-to-back slots with the same people merge into one block', () => {
  const ev = { mode: 'dates', days: ['2026-11-24'], start: 540, end: 720, step: 30, tz: 'UTC' };
  const k = C.slotKeys(ev);
  const best = C.bestTimes(ev, [{ id: 'x', avail: k.slice(0, 4), maybe: [] }]);
  assert.equal(best.length, 1);
  assert.equal(best[0].end - best[0].start, 120);
});
