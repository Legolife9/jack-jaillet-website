/* When You Free? calendar files: reads an .ics export into busy times (on this device only)
   and writes the final time as an .ics file or an "add to calendar" link. MIT license.
   Needs core.js (WYFCore) for time zone math. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core.js') : root.WYFCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WYFIcs = api;
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  // Outlook and Exchange name zones the Windows way
  const WINDOWS_TZ = {
    'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago',
    'Mountain Standard Time': 'America/Denver', 'US Mountain Standard Time': 'America/Phoenix',
    'Pacific Standard Time': 'America/Los_Angeles', 'Alaskan Standard Time': 'America/Anchorage',
    'Hawaiian Standard Time': 'Pacific/Honolulu', 'Atlantic Standard Time': 'America/Halifax',
    'Newfoundland Standard Time': 'America/St_Johns', 'Canada Central Standard Time': 'America/Regina',
    'Central Standard Time (Mexico)': 'America/Mexico_City', 'Mexico Standard Time': 'America/Mexico_City',
    'Central America Standard Time': 'America/Guatemala', 'SA Pacific Standard Time': 'America/Bogota',
    'E. South America Standard Time': 'America/Sao_Paulo', 'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
    'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik',
    'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris',
    'Central Europe Standard Time': 'Europe/Budapest', 'Central European Standard Time': 'Europe/Warsaw',
    'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Kiev', 'GTB Standard Time': 'Europe/Bucharest',
    'Turkey Standard Time': 'Europe/Istanbul', 'Russian Standard Time': 'Europe/Moscow', 'Israel Standard Time': 'Asia/Jerusalem',
    'Egypt Standard Time': 'Africa/Cairo', 'South Africa Standard Time': 'Africa/Johannesburg',
    'Arabian Standard Time': 'Asia/Dubai', 'Pakistan Standard Time': 'Asia/Karachi', 'India Standard Time': 'Asia/Kolkata',
    'Nepal Standard Time': 'Asia/Kathmandu', 'SE Asia Standard Time': 'Asia/Bangkok', 'China Standard Time': 'Asia/Shanghai',
    'Singapore Standard Time': 'Asia/Singapore', 'Taipei Standard Time': 'Asia/Taipei', 'Korea Standard Time': 'Asia/Seoul',
    'Tokyo Standard Time': 'Asia/Tokyo', 'W. Australia Standard Time': 'Australia/Perth',
    'Cen. Australia Standard Time': 'Australia/Adelaide', 'E. Australia Standard Time': 'Australia/Brisbane',
    'AUS Eastern Standard Time': 'Australia/Sydney', 'New Zealand Standard Time': 'Pacific/Auckland',
    'UTC': 'UTC', 'Coordinated Universal Time': 'UTC'
  };

  function resolveTz(tzid, fallback) {
    if (!tzid) return fallback;
    const t = tzid.replace(/^"|"$/g, '');
    if (C.validTz(t)) return t;
    if (WINDOWS_TZ[t]) return WINDOWS_TZ[t];
    const m = t.match(/([A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/); // "/mozilla.org/.../America/New_York"
    if (m && C.validTz(m[1])) return m[1];
    return fallback;
  }

  /* ---------- reading ---------- */

  function unfold(text) {
    return String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '');
  }

  // "DTSTART;TZID=America/New_York:20261125T140000" -> { name, params, value }
  function parseLine(line) {
    let i = 0, q = false;
    for (; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') q = !q;
      else if (ch === ':' && !q) break;
    }
    const head = line.slice(0, i), value = line.slice(i + 1);
    const bits = head.split(';');
    const params = {};
    for (const b of bits.slice(1)) { const j = b.indexOf('='); if (j > 0) params[b.slice(0, j).toUpperCase()] = b.slice(j + 1); }
    return { name: bits[0].toUpperCase(), params, value };
  }

  // a DATE or DATE-TIME value -> { ms, allDay, date, min }
  function parseWhen(value, params, fallbackTz) {
    const v = String(value).trim();
    const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    if (!m[4] || (params && params.VALUE === 'DATE')) {
      return { allDay: true, date, min: 0, tz: fallbackTz, ms: C.zonedToMs(date, 0, fallbackTz) };
    }
    const min = +m[4] * 60 + +m[5];
    if (m[7]) return { allDay: false, date, min, tz: 'UTC', ms: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) };
    const tz = resolveTz(params && params.TZID, fallbackTz);
    return { allDay: false, date, min, tz, ms: C.zonedToMs(date, min, tz) + (+(m[6] || 0)) * 1000 };
  }

  // "PT1H30M", "P1D", "P2W" -> ms
  function parseDuration(v) {
    const m = String(v).match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!m) return 0;
    const ms = ((+(m[2] || 0) * 7 + +(m[3] || 0)) * 86400 + +(m[4] || 0) * 3600 + +(m[5] || 0) * 60 + +(m[6] || 0)) * 1000;
    return m[1] === '-' ? -ms : ms;
  }

  const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  // dates (YYYY-MM-DD) of one month that match BYDAY like "2TU", "-1FR" or "MO"
  function monthByDay(y, m, byday) {
    const out = [];
    const n = daysInMonth(y, m);
    for (const spec of byday) {
      const mm = spec.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
      if (!mm) continue;
      const wd = DAYS[mm[2]];
      const hits = [];
      for (let d = 1; d <= n; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === wd) hits.push(d);
      const nth = mm[1] ? +mm[1] : 0;
      const picked = nth === 0 ? hits : [nth > 0 ? hits[nth - 1] : hits[hits.length + nth]];
      for (const d of picked) if (d) out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return out.sort();
  }

  /* Every occurrence start (ms) of an event that could touch [from, to). Walks in the event's own
     time zone so a 9:00 meeting stays at 9:00 across daylight saving changes. */
  function occurrences(ev, from, to) {
    if (!ev.rrule) return [ev.start];
    const r = ev.rrule;
    const interval = Math.max(1, +r.INTERVAL || 1);
    const count = r.COUNT ? +r.COUNT : Infinity;
    const until = r.UNTIL ? (parseWhen(r.UNTIL, {}, ev.tz) || {}).ms : Infinity;
    const p = ev.allDay ? { date: ev.date, min: 0 } : C.partsIn(ev.start, ev.tz);
    const startDate = ev.allDay ? ev.date : p.date;
    const startMin = ev.allDay ? 0 : p.min;
    const lowDate = C.partsIn(from - 2 * 86400000, 'UTC').date;
    const highDate = C.partsIn(to + 2 * 86400000, 'UTC').date;
    const out = [];
    let n = 0, guard = 0;
    // returns false when the walk should stop
    const take = date => {
      if (date < startDate) return true;
      if (++n > count) return false;
      if (date > highDate) return false;
      if (date < lowDate) return true; // too early to matter: count it, skip the time math
      const ms = C.zonedToMs(date, startMin, ev.tz);
      if (ms > until) return false;
      out.push(ms);
      return true;
    };
    const freq = r.FREQ;
    const byday = r.BYDAY ? r.BYDAY.split(',') : null;
    const [y0, m0] = startDate.split('-').map(Number);
    outer:
    for (let i = 0; guard < 20000; i += interval) {
      guard++;
      let dates;
      if (freq === 'DAILY') dates = [C.addDays(startDate, i)];
      else if (freq === 'WEEKLY') {
        const wkst = DAYS[r.WKST] != null ? DAYS[r.WKST] : 1;
        const back = (C.weekdayOf(startDate) - wkst + 7) % 7;
        const weekStart = C.addDays(startDate, i * 7 - back);
        const wds = byday ? byday.map(s => DAYS[s.slice(-2)]).filter(x => x != null) : [C.weekdayOf(startDate)];
        dates = [...new Set(wds)].map(wd => C.addDays(weekStart, (wd - wkst + 7) % 7)).sort();
      } else if (freq === 'MONTHLY') {
        const mi = m0 - 1 + i, y = y0 + Math.floor(mi / 12), m = (mi % 12) + 1;
        if (byday) dates = monthByDay(y, m, byday);
        else {
          const days = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : [+startDate.slice(8, 10)];
          const n2 = daysInMonth(y, m);
          dates = days.map(d => (d < 0 ? n2 + 1 + d : d)).filter(d => d >= 1 && d <= n2).sort((a, b) => a - b)
            .map(d => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        }
      } else if (freq === 'YEARLY') {
        const y = y0 + i, md = startDate.slice(5);
        dates = md === '02-29' && daysInMonth(y, 2) < 29 ? [] : [`${y}-${md}`];
      } else return [ev.start]; // HOURLY and friends: just the first one
      for (const d of dates) if (!take(d)) break outer;
    }
    return out;
  }

  /* Busy times from .ics text, clipped to [from, to) (ms). Only start and end times are kept:
     titles, places and attendees are never read. Free ("transparent") and cancelled events are
     skipped, and so are all-day events unless they say they make you busy. */
  function busyFromIcs(text, from, to, fallbackTz) {
    const tzFallback = fallbackTz || C.localTz();
    const lines = unfold(text).split('\n');
    const events = [];
    let cur = null, depth = 0;
    for (const raw of lines) {
      if (!raw) continue;
      const L = parseLine(raw);
      if (L.name === 'BEGIN') {
        if (L.value.toUpperCase() === 'VEVENT' && !cur) { cur = { exdates: [] }; depth = 0; }
        else if (cur) depth++;
        continue;
      }
      if (L.name === 'END') {
        if (cur && depth > 0) { depth--; continue; }
        if (L.value.toUpperCase() === 'VEVENT' && cur) { events.push(cur); cur = null; }
        continue;
      }
      if (!cur || depth > 0) continue; // skip VALARM and the like
      switch (L.name) {
        case 'UID': cur.uid = L.value; break;
        case 'DTSTART': cur.dtstart = parseWhen(L.value, L.params, tzFallback); break;
        case 'DTEND': cur.dtend = parseWhen(L.value, L.params, tzFallback); break;
        case 'DURATION': cur.duration = parseDuration(L.value); break;
        case 'RRULE': cur.rrule = Object.fromEntries(L.value.split(';').map(kv => kv.split('=')).filter(kv => kv.length === 2).map(([k, v]) => [k.toUpperCase(), v])); break;
        case 'EXDATE': for (const v of L.value.split(',')) { const w = parseWhen(v, L.params, tzFallback); if (w) cur.exdates.push(w.ms); } break;
        case 'RECURRENCE-ID': cur.recurrenceId = parseWhen(L.value, L.params, tzFallback); break;
        case 'STATUS': cur.status = L.value.toUpperCase(); break;
        case 'TRANSP': cur.transp = L.value.toUpperCase(); break;
      }
    }
    // moved or cancelled single occurrences replace the matching occurrence of their series
    const overridden = new Map();
    for (const e of events) if (e.uid && e.recurrenceId) {
      let s = overridden.get(e.uid); if (!s) overridden.set(e.uid, s = new Set());
      s.add(e.recurrenceId.ms);
    }
    const busy = [];
    for (const e of events) {
      if (!e.dtstart || e.status === 'CANCELLED' || e.transp === 'TRANSPARENT') continue;
      const allDay = e.dtstart.allDay;
      if (allDay && e.transp !== 'OPAQUE') continue;
      let dur;
      if (e.dtend) dur = e.dtend.ms - e.dtstart.ms;
      else if (e.duration) dur = e.duration;
      else dur = allDay ? 86400000 : 0;
      if (dur <= 0) continue;
      const ev = { start: e.dtstart.ms, allDay, date: e.dtstart.date, tz: e.dtstart.tz, rrule: e.recurrenceId ? null : e.rrule };
      const skip = new Set(e.exdates);
      const over = !e.recurrenceId && e.uid ? overridden.get(e.uid) : null;
      for (const s of occurrences(ev, from, to)) {
        if (skip.has(s) || (over && over.has(s))) continue;
        const end = s + dur;
        if (end > from && s < to) busy.push([Math.max(s, from), Math.min(end, to)]);
      }
    }
    busy.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const b of busy) {
      const last = merged[merged.length - 1];
      if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]); else merged.push(b.slice());
    }
    return merged;
  }

  // which slots (epoch minutes) overlap any busy interval
  function busySlots(keys, step, busy) {
    const out = new Set();
    let j = 0;
    for (const k of keys) {
      const s = k * 60000, e = s + step * 60000;
      while (j < busy.length && busy[j][1] <= s) j++;
      for (let i = j; i < busy.length && busy[i][0] < e; i++) if (busy[i][1] > s) { out.add(k); break; }
    }
    return out;
  }

  /* ---------- writing ---------- */

  const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

  // lines longer than 75 octets wrap, continuing with a space (never splitting a character)
  function fold(line) {
    const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    const size = ch => (enc ? enc.encode(ch).length : ch.length);
    const parts = [];
    let cur = '', n = 0;
    for (const ch of line) {
      const s = size(ch);
      if (n + s > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; n = 0; }
      cur += ch; n += s;
    }
    parts.push(cur);
    return parts.join('\r\n ');
  }

  // a one-event calendar file; times are epoch minutes, `weekly` repeats it every week
  function makeIcs(o) {
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//jackjaillet.com//When You Free//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + o.uid,
      'DTSTAMP:' + stamp(o.now || Date.now()),
      'DTSTART:' + stamp(o.start * 60000),
      'DTEND:' + stamp(o.end * 60000)
    ];
    if (o.weekly) lines.push('RRULE:FREQ=WEEKLY');
    lines.push('SUMMARY:' + esc(o.title));
    const desc = [o.details, o.url].filter(Boolean).join('\n\n');
    if (desc) lines.push('DESCRIPTION:' + esc(desc));
    if (o.url) lines.push('URL:' + o.url);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function googleLink(o) {
    const q = new URLSearchParams({ action: 'TEMPLATE', text: o.title, dates: stamp(o.start * 60000) + '/' + stamp(o.end * 60000) });
    const desc = [o.details, o.url].filter(Boolean).join('\n\n');
    if (desc) q.set('details', desc);
    if (o.weekly) q.set('recur', 'RRULE:FREQ=WEEKLY');
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }

  function outlookLink(o) {
    const iso = m => new Date(m * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const q = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: o.title, startdt: iso(o.start), enddt: iso(o.end) });
    const desc = [o.details, o.url].filter(Boolean).join('\n\n');
    if (desc) q.set('body', desc);
    return 'https://outlook.live.com/calendar/0/action/compose?' + q.toString();
  }

  return { busyFromIcs, busySlots, makeIcs, googleLink, outlookLink, resolveTz, parseDuration, unfold };
});
