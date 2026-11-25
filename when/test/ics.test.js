// Run with: node --test when/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../js/ics.js');

const day = (y, m, d) => Date.UTC(y, m - 1, d);
const hhmm = ms => new Date(ms).toISOString().slice(0, 16);

const cal = body => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' + body.trim().split('\n').map(s => s.trim()).join('\r\n') + '\r\nEND:VCALENDAR\r\n';

test('timed events in UTC, a named zone, a Windows zone and floating time', () => {
  const text = cal(`
    BEGIN:VEVENT
    UID:a
    DTSTART:20261124T150000Z
    DTEND:20261124T160000Z
    SUMMARY:Dentist
    END:VEVENT
    BEGIN:VEVENT
    UID:b
    DTSTART;TZID=America/New_York:20261125T090000
    DURATION:PT30M
    END:VEVENT
    BEGIN:VEVENT
    UID:c
    DTSTART;TZID="Pacific Standard Time":20261126T090000
    DTEND;TZID="Pacific Standard Time":20261126T100000
    END:VEVENT
    BEGIN:VEVENT
    UID:d
    DTSTART:20261127T120000
    DTEND:20261127T130000
    END:VEVENT`);
  const busy = I.busyFromIcs(text, day(2026, 11, 23), day(2026, 11, 30), 'Europe/London');
  assert.deepEqual(busy.map(b => [hhmm(b[0]), hhmm(b[1])]), [
    ['2026-11-24T15:00', '2026-11-24T16:00'],
    ['2026-11-25T14:00', '2026-11-25T14:30'],
    ['2026-11-26T17:00', '2026-11-26T18:00'],
    ['2026-11-27T12:00', '2026-11-27T13:00']
  ]);
});

test('free, cancelled and plain all-day events are skipped; busy all-day ones count', () => {
  const text = cal(`
    BEGIN:VEVENT
    UID:free
    DTSTART:20261124T150000Z
    DTEND:20261124T160000Z
    TRANSP:TRANSPARENT
    END:VEVENT
    BEGIN:VEVENT
    UID:cancel
    DTSTART:20261124T170000Z
    DTEND:20261124T180000Z
    STATUS:CANCELLED
    END:VEVENT
    BEGIN:VEVENT
    UID:bday
    DTSTART;VALUE=DATE:20261125
    DTEND;VALUE=DATE:20261126
    END:VEVENT
    BEGIN:VEVENT
    UID:away
    DTSTART;VALUE=DATE:20261126
    DTEND;VALUE=DATE:20261127
    TRANSP:OPAQUE
    END:VEVENT`);
  const busy = I.busyFromIcs(text, day(2026, 11, 23), day(2026, 11, 30), 'UTC');
  assert.deepEqual(busy.map(b => [hhmm(b[0]), hhmm(b[1])]), [['2026-11-26T00:00', '2026-11-27T00:00']]);
});

test('weekly repeats with BYDAY, EXDATE, a moved occurrence, and daylight saving', () => {
  const text = cal(`
    BEGIN:VEVENT
    UID:class
    DTSTART;TZID=America/New_York:20261005T100000
    DTEND;TZID=America/New_York:20261005T110000
    RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000Z
    EXDATE;TZID=America/New_York:20261125T100000
    BEGIN:VALARM
    TRIGGER:-PT15M
    END:VALARM
    END:VEVENT
    BEGIN:VEVENT
    UID:class
    RECURRENCE-ID;TZID=America/New_York:20261123T100000
    DTSTART;TZID=America/New_York:20261123T140000
    DTEND;TZID=America/New_York:20261123T150000
    END:VEVENT`);
  const busy = I.busyFromIcs(text, day(2026, 11, 23), day(2026, 12, 3), 'UTC');
  assert.deepEqual(busy.map(b => hhmm(b[0])), [
    '2026-11-23T19:00', // Monday moved to 2 PM
    '2026-11-30T15:00', // 10 AM EST (it was 14:00 UTC in October)
    '2026-12-02T15:00'
  ]); // Wednesday the 25th was cancelled
  const october = I.busyFromIcs(text, day(2026, 10, 5), day(2026, 10, 6), 'UTC');
  assert.equal(hhmm(october[0][0]), '2026-10-05T14:00');
});

test('daily repeats with COUNT and monthly by weekday', () => {
  const text = cal(`
    BEGIN:VEVENT
    UID:standup
    DTSTART:20261120T130000Z
    DTEND:20261120T131500Z
    RRULE:FREQ=DAILY;COUNT=5
    END:VEVENT
    BEGIN:VEVENT
    UID:board
    DTSTART:20260908T230000Z
    DTEND:20260909T000000Z
    RRULE:FREQ=MONTHLY;BYDAY=2TU
    END:VEVENT`);
  const busy = I.busyFromIcs(text, day(2026, 11, 22), day(2026, 12, 9), 'UTC');
  assert.deepEqual(busy.map(b => hhmm(b[0])), ['2026-11-22T13:00', '2026-11-23T13:00', '2026-11-24T13:00', '2026-12-08T23:00']);
});

test('busy slots', () => {
  const k0 = Math.round(Date.UTC(2026, 10, 24, 9) / 60000);
  const keys = [k0, k0 + 30, k0 + 60, k0 + 90];
  const busy = [[Date.UTC(2026, 10, 24, 9, 45), Date.UTC(2026, 10, 24, 10, 0)]];
  assert.deepEqual([...I.busySlots(keys, 30, busy)], [k0 + 30]);
});

test('writing a calendar file escapes text and folds long lines', () => {
  const start = Math.round(Date.UTC(2026, 10, 25, 19) / 60000);
  const ics = I.makeIcs({ uid: 'abc@jackjaillet.com', title: 'Board, meeting; with "notes"', details: 'Line one\nLine two ' + 'é'.repeat(60),
    url: 'https://jackjaillet.com/when/?e=abc', start, end: start + 60, now: Date.UTC(2026, 10, 22) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261125T190000Z\r\n/);
  assert.match(ics, /SUMMARY:Board\\, meeting\\; with "notes"\r\n/);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, 'line too long: ' + line);
  const unfolded = I.unfold(ics);
  assert.match(unfolded, /DESCRIPTION:Line one\\nLine two é+\\n\\nhttps:\/\/jackjaillet.com\/when\/\?e=abc/);
  const weekly = I.makeIcs({ uid: 'w', title: 'Club', start, end: start + 60, weekly: true });
  assert.match(weekly, /RRULE:FREQ=WEEKLY\r\n/);
});

test('add-to-calendar links', () => {
  const start = Math.round(Date.UTC(2026, 10, 25, 19) / 60000);
  const g = new URL(I.googleLink({ title: 'Club', start, end: start + 90, url: 'https://x.test', weekly: true }));
  assert.equal(g.searchParams.get('dates'), '20261125T190000Z/20261125T203000Z');
  assert.equal(g.searchParams.get('recur'), 'RRULE:FREQ=WEEKLY');
  const o = new URL(I.outlookLink({ title: 'Club', start, end: start + 90 }));
  assert.equal(o.searchParams.get('startdt'), '2026-11-25T19:00:00Z');
});
