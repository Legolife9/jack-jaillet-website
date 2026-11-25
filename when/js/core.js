/* When You Free? core: time zones, slots, grid layout and best-time ranking.
   No DOM, so the tests in ../test run it under Node too. MIT license. Part of jackjaillet.com.

   A poll is { mode: 'dates' | 'week', days: ['YYYY-MM-DD', ...], start, end, step, tz }:
   every day gets slots from `start` to `end` (minutes after midnight) every `step` minutes,
   in the organizer's time zone `tz`. Each slot is stored as epoch minutes (minutes since
   1970-01-01 UTC), so a viewer anywhere can lay the same moments out in their own zone.
   "Days of the week" polls use the dates of one reference week and show only weekday names. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WYFCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 1440;
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /* ---------- time zones ---------- */

  const partsFmts = new Map();
  function partsFmt(tz) {
    let f = partsFmts.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', weekday: 'short',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      partsFmts.set(tz, f);
    }
    return f;
  }

  // wall-clock parts of an instant in a zone; `min` is minutes after local midnight, `wd` 0 = Sunday
  function partsIn(ms, tz) {
    const o = {};
    for (const p of partsFmt(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
    const h = +o.hour === 24 ? 0 : +o.hour; // some engines write midnight as 24
    return { y: +o.year, m: +o.month, d: +o.day, h, mi: +o.minute, wd: WD[o.weekday], date: `${o.year}-${o.month}-${o.day}`, min: h * 60 + +o.minute };
  }

  // minutes the zone is ahead of UTC at that instant
  function offsetMin(ms, tz) {
    const p = partsIn(ms, tz);
    return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000) / 60000;
  }

  // the instant (ms) when the clock in `tz` reads `dateStr` + `minutes`
  function zonedToMs(dateStr, minutes, tz) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const guess = Date.UTC(y, m - 1, d, 0, minutes);
    const o1 = offsetMin(guess, tz);
    let ms = guess - o1 * 60000;
    const o2 = offsetMin(ms, tz);
    if (o2 !== o1) ms = guess - o2 * 60000;
    return ms;
  }

  function validTz(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
  }

  function localTz() {
    try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; if (validTz(z)) return z; } catch (e) {}
    return 'UTC';
  }

  function allTimeZones() {
    try { if (Intl.supportedValuesOf) return Intl.supportedValuesOf('timeZone'); } catch (e) {}
    return ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
      'America/Anchorage', 'Pacific/Honolulu', 'America/Halifax', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris',
      'Europe/Berlin', 'Europe/Athens', 'Europe/Moscow', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata',
      'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
  }

  // "GMT-5", "GMT+5:30"
  function gmtLabel(tz, at) {
    const o = offsetMin(at == null ? Date.now() : at, tz);
    const s = o < 0 ? '-' : '+', a = Math.abs(o);
    return 'GMT' + (a ? s + Math.floor(a / 60) + (a % 60 ? ':' + String(a % 60).padStart(2, '0') : '') : '');
  }

  // "New York (GMT-5)"
  function tzLabel(tz, at) {
    const city = tz === 'UTC' ? 'UTC' : tz.split('/').pop().replace(/_/g, ' ');
    return tz === 'UTC' ? 'UTC' : `${city} (${gmtLabel(tz, at)})`;
  }

  /* ---------- dates ---------- */

  const pad = n => String(n).padStart(2, '0');
  function addDays(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  function weekdayOf(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }
  function todayIn(tz) { return partsIn(Date.now(), tz).date; }

  // "Days of the week" polls: the dates of the reference week (Sunday first) that holds `dateStr`
  function weekDates(weekdays, dateStr) {
    const sunday = addDays(dateStr, -weekdayOf(dateStr));
    return [...new Set(weekdays)].sort((a, b) => a - b).map(w => addDays(sunday, w));
  }

  // first day of the week for the visitor's locale (0 = Sunday)
  function firstDayOfWeek(locale) {
    try {
      const l = new Intl.Locale(locale || (typeof navigator !== 'undefined' ? navigator.language : 'en-US'));
      const info = l.getWeekInfo ? l.getWeekInfo() : l.weekInfo;
      if (info && info.firstDay) return info.firstDay % 7;
    } catch (e) {}
    return 0;
  }

  /* ---------- slots and layout ---------- */

  // every slot of a poll, as sorted epoch minutes
  function slotKeys(ev) {
    const set = new Set();
    for (const day of ev.days) {
      for (let t = ev.start; t < ev.end; t += ev.step) set.add(Math.round(zonedToMs(day, t, ev.tz) / 60000));
    }
    return [...set].sort((a, b) => a - b);
  }

  /* Lays a poll's slots out as a grid in the viewer's zone: one column per local day (per
     weekday for weekly polls), one row per local time that any slot lands on. Rows that jump
     past a gap (a poll that crosses midnight for this viewer) are marked so the grid can show a break.
     grid[col][row] is the slot's epoch minute, or null where that day has no such time. */
  function layout(ev, tz, firstDay) {
    const keys = slotKeys(ev);
    const cols = new Map(), rowSet = new Set(), at = new Map();
    for (const k of keys) {
      const p = partsIn(k * 60000, tz);
      const ck = ev.mode === 'week' ? 'w' + p.wd : p.date;
      if (!cols.has(ck)) cols.set(ck, { key: ck, date: p.date, wd: p.wd });
      rowSet.add(p.min);
      at.set(ck + '|' + p.min, k);
    }
    const fd = firstDay == null ? 0 : firstDay;
    const colList = [...cols.values()].sort(ev.mode === 'week'
      ? (a, b) => ((a.wd - fd + 7) % 7) - ((b.wd - fd + 7) % 7)
      : (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const mins = [...rowSet].sort((a, b) => a - b);
    const rows = mins.map((min, i) => ({ min, gap: i > 0 && min - mins[i - 1] > ev.step }));
    const grid = colList.map(c => mins.map(min => { const k = at.get(c.key + '|' + min); return k == null ? null : k; }));
    const pos = new Map();
    grid.forEach((col, ci) => col.forEach((k, ri) => { if (k != null) pos.set(k, [ci, ri]); }));
    return { keys, cols: colList, rows, grid, pos, step: ev.step };
  }

  /* ---------- formatting ---------- */

  const fmts = new Map();
  function fmt(locale, opts) {
    const key = locale + JSON.stringify(opts);
    let f = fmts.get(key);
    if (!f) { f = new Intl.DateTimeFormat(locale, opts); fmts.set(key, f); }
    return f;
  }
  const loc = () => (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

  // minutes after midnight as a clock time: "9:00 AM" (or "9 AM" with short)
  function clock(min, short, locale) {
    const opts = { timeZone: 'UTC', hour: 'numeric' };
    if (!short || min % 60) opts.minute = '2-digit';
    return fmt(locale || loc(), opts).format(new Date(Date.UTC(2000, 0, 1, 0, min)));
  }

  // "Tue" / "Nov 25" for a column
  function dayLabel(col, mode, locale) {
    const [y, m, d] = col.date.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    const L = locale || loc();
    return {
      top: fmt(L, { timeZone: 'UTC', weekday: 'short' }).format(t),
      bottom: mode === 'week' ? '' : fmt(L, { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(t),
      long: mode === 'week' ? fmt(L, { timeZone: 'UTC', weekday: 'long' }).format(t) : fmt(L, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(t)
    };
  }

  // one slot, spoken: "Tuesday, November 25, 2:00 PM"
  function slotLabel(key, tz, mode, locale) {
    const L = locale || loc();
    const opts = mode === 'week'
      ? { timeZone: tz, weekday: 'long', hour: 'numeric', minute: '2-digit' }
      : { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    return fmt(L, opts).format(new Date(key * 60000));
  }

  // a span of time: { day: "Tuesday, November 25", time: "2:00 – 3:30 PM" }
  function rangeLabel(startKey, endKey, tz, mode, locale) {
    const L = locale || loc();
    const a = new Date(startKey * 60000), b = new Date(endKey * 60000);
    const dayOpts = mode === 'week' ? { timeZone: tz, weekday: 'long' } : { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' };
    const day = fmt(L, dayOpts).format(a);
    const tf = fmt(L, { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    const startDate = partsIn(a.getTime(), tz).date;
    const sameDay = startDate === partsIn(b.getTime() - 1, tz).date; // ending at midnight still counts as the same day
    let time;
    // formatRange adds full dates whenever the end is on another date, even at midnight, so only use it within one date
    if (sameDay && tf.formatRange && partsIn(b.getTime(), tz).date === startDate) time = tf.formatRange(a, b);
    else time = tf.format(a) + ' – ' + (sameDay ? '' : fmt(L, mode === 'week' ? { timeZone: tz, weekday: 'short' } : { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(b) + ', ') + tf.format(b);
    return { day, time };
  }

  // short summary of a poll's days: "Nov 24 – Dec 2" or "Mon, Wed, Fri"
  function daysSummary(ev, locale) {
    const L = locale || loc();
    if (!ev.days || !ev.days.length) return '';
    const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
    const sorted = [...ev.days].sort();
    if (ev.mode === 'week') {
      const fd = firstDayOfWeek(L);
      return sorted.map(s => ({ s, wd: weekdayOf(s) })).sort((a, b) => ((a.wd - fd + 7) % 7) - ((b.wd - fd + 7) % 7))
        .map(x => fmt(L, { timeZone: 'UTC', weekday: 'short' }).format(toDate(x.s))).join(', ');
    }
    const f = fmt(L, { timeZone: 'UTC', month: 'short', day: 'numeric' });
    if (sorted.length === 1) return fmt(L, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(toDate(sorted[0]));
    return f.format(toDate(sorted[0])) + ' – ' + f.format(toDate(sorted[sorted.length - 1])) + ` (${sorted.length} days)`;
  }

  /* ---------- weekly polls: the next real occurrence ---------- */

  // a weekly poll's chosen time sits in its reference week; this finds the next real one after `now`
  function nextWeekly(startKey, endKey, tz, now) {
    const p = partsIn(startKey * 60000, tz);
    const dur = endKey - startKey;
    const t = now == null ? Date.now() : now;
    let date = p.date;
    let ms = zonedToMs(date, p.min, tz);
    if (ms <= t) {
      const weeks = Math.floor((t - ms) / (7 * 86400000));
      date = addDays(date, weeks * 7);
      ms = zonedToMs(date, p.min, tz);
      while (ms <= t) { date = addDays(date, 7); ms = zonedToMs(date, p.min, tz); }
    }
    const s = Math.round(ms / 60000);
    return [s, s + dur];
  }

  /* ---------- the group's answers ---------- */

  // { key: { yes: [ids], maybe: [ids] } } for the people in `people` (all when omitted)
  function tally(responses, people) {
    const out = new Map();
    for (const r of responses) {
      if (people && !people.has(r.id)) continue;
      for (const k of r.avail) { let c = out.get(k); if (!c) out.set(k, c = { yes: [], maybe: [] }); c.yes.push(r.id); }
      for (const k of r.maybe) {
        if (r.availSet ? r.availSet.has(k) : r.avail.includes(k)) continue;
        let c = out.get(k); if (!c) out.set(k, c = { yes: [], maybe: [] }); c.maybe.push(r.id);
      }
    }
    return out;
  }

  /* The best times: runs of back-to-back slots where exactly the same people are free, ranked by
     (1) fewest required people missing, (2) most people free, counting "if needed" as half,
     (3) longest, (4) earliest. Returns up to `limit` of them. */
  function bestTimes(ev, responses, limit) {
    if (!responses.length) return [];
    const keys = slotKeys(ev);
    const counts = tally(responses);
    const req = new Set((ev.required || []).filter(id => responses.some(r => r.id === id)));
    const blocks = [];
    let cur = null;
    for (const k of keys) {
      const c = counts.get(k) || { yes: [], maybe: [] };
      const sig = c.yes.slice().sort().join(',') + '|' + c.maybe.slice().sort().join(',');
      if (cur && cur.sig === sig && k === cur.end) { cur.end = k + ev.step; continue; }
      cur = { sig, start: k, end: k + ev.step, yes: c.yes.slice(), maybe: c.maybe.slice() };
      blocks.push(cur);
    }
    const ranked = blocks
      .map(b => {
        const free = new Set([...b.yes, ...b.maybe]);
        const missingReq = [...req].filter(id => !free.has(id)).length;
        return { start: b.start, end: b.end, yes: b.yes, maybe: b.maybe, missingReq,
          no: responses.filter(r => !free.has(r.id)).map(r => r.id),
          score: b.yes.length + b.maybe.length / 2 };
      })
      .filter(b => b.score > 0)
      .sort((a, b) => a.missingReq - b.missingReq || b.score - a.score || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    return ranked.slice(0, limit || 3);
  }

  return {
    DAY, partsIn, offsetMin, zonedToMs, validTz, localTz, allTimeZones, gmtLabel, tzLabel,
    addDays, weekdayOf, todayIn, weekDates, firstDayOfWeek,
    slotKeys, layout, clock, dayLabel, slotLabel, rangeLabel, daysSummary, nextWeekly, tally, bestTimes
  };
});
