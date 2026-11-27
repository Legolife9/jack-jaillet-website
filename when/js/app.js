/* WhenUFree: group availability polls. MIT license. Part of jackjaillet.com.
   Plain JavaScript, no build step. Polls live in Supabase and every read and write goes
   through the wyf_* functions in ../supabase/schema.sql. Google sign-in is shared with
   Signature Studio and is optional: without it, this browser remembers your polls. */
(function () {
'use strict';

const C = window.WYFCore, I = window.WYFIcs;
const SUPABASE_URL = 'https://rizgpvzmazuvidvbpkoa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gi6G-cLhq6wYpiB3G7kEsg_G_aI0QKk'; // public by design; the database functions do the protecting
const GOOGLE_CLIENT_ID = '177957739990-5jnfagsstcbia381oek4lbg9vf4qmv0s.apps.googleusercontent.com';
const POLL_EVERY = 12000; // how often an open poll checks for new answers (ms)

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const LOC = navigator.language || 'en-US';
const FIRST_DAY = C.firstDayOfWeek(LOC);
const HOME_TZ = C.localTz();
const coarse = () => matchMedia('(pointer: coarse)').matches;
const baseUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
const pollUrl = id => baseUrl() + '?e=' + id;

const ICON = {
  moon: '<svg class="ico moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  check: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  x: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  cal: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  copy: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  mail: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="5.5" width="17" height="13" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 7l7.5 6 7.5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  chat: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-7l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  google: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4 5.6-4z"/></svg>',
  share: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 13v6h14v-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

/* ---------- this browser's memory ---------- */

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
// every poll this browser made or answered: { id: { title, admin, rid, token, name, pass, seenIds, ... } }
const KNOWN = 'wyf.polls';
const known = () => store.get(KNOWN, {}) || {};
function remember(id, patch) {
  const all = known();
  all[id] = Object.assign({ id }, all[id], patch);
  store.set(KNOWN, all);
  return all[id];
}
function forgetPoll(id) { const all = known(); delete all[id]; store.set(KNOWN, all); store.del('wyf.busy.' + id); }

/* ---------- small UI helpers ---------- */

let toastTimer = 0;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  if (action) t.querySelector('button').onclick = () => { t.hidden = true; action.run(); };
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 9000 : 4500);
}

const dlg = $('#dlg');
let dlgOnClose = null;
// One <dialog> serves every box. The browser fires its "close" event later, after the next box
// may already be open, so an outgoing box's callback runs right away here and the late event
// is ignored if a new box is showing.
function openDialog(title, html, onMount, opts) {
  closeDialog();
  $('#dlgtitle').textContent = title;
  $('#dlgbody').innerHTML = html;
  dlg.classList.toggle('wide', !!(opts && opts.wide));
  dlg.classList.toggle('ready', !!(opts && opts.cls === 'ready'));
  dlgOnClose = (opts && opts.onClose) || null;
  dlg.showModal();
  if (onMount) onMount($('#dlgbody'));
  const f = $('#dlgbody [autofocus]');
  if (f) f.focus();
}
function closeDialog() {
  if (!dlg.open) return;
  const f = dlgOnClose;
  dlgOnClose = null;
  dlg.close();
  if (f) f();
}
$('#dlgclose').addEventListener('click', closeDialog);
dlg.addEventListener('click', e => { if (e.target === dlg) closeDialog(); }); // backdrop
dlg.addEventListener('close', () => { // also reached by the Escape key
  if (dlg.open) return; // a new box opened in the meantime
  const f = dlgOnClose;
  dlgOnClose = null;
  $('#dlgbody').innerHTML = '';
  if (f) f();
});

function confirmDialog(title, text, okLabel, danger) {
  return new Promise(res => {
    let ok = false;
    openDialog(title, `<p>${esc(text)}</p><div class="dlgactions"><button type="button" class="btn ${danger ? 'danger solid' : 'primary'}" data-ok>${esc(okLabel)}</button><button type="button" class="btn ghost" data-no>Cancel</button></div>`,
      b => { b.querySelector('[data-ok]').onclick = () => { ok = true; closeDialog(); }; b.querySelector('[data-no]').onclick = closeDialog; b.querySelector('[data-no]').focus(); },
      { onClose: () => res(ok) });
  });
}

async function copyText(text, btn) {
  let done = false;
  try { await navigator.clipboard.writeText(text); done = true; } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'offscreen';
    document.body.appendChild(ta); ta.select();
    try { done = document.execCommand('copy'); } catch (e2) {}
    ta.remove();
  }
  if (btn) {
    const old = btn.dataset.label || btn.innerHTML;
    btn.dataset.label = old;
    btn.innerHTML = done ? ICON.check + 'Copied' : 'Select and copy';
    btn.classList.toggle('copied', done);
    setTimeout(() => { btn.innerHTML = old; btn.classList.remove('copied'); }, 1800);
  }
  return done;
}
const copyRow = (value, label, primary) => `<div class="copyrow"><input type="text" readonly value="${esc(value)}" aria-label="${esc(label)}"><button type="button" class="btn ${primary ? 'primary' : 'sm'}" data-copy="${esc(value)}">${ICON.copy}Copy</button></div>`;
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-copy]');
  if (b) { copyText(b.dataset.copy, b); return; }
  const sh = e.target.closest('[data-share]');
  if (sh) { try { await navigator.share({ title: sh.dataset.title, text: `When are you free for “${sh.dataset.title}”?`, url: sh.dataset.share }); } catch (x) {} }
});
document.addEventListener('focusin', e => { if (e.target.matches('.copyrow input')) e.target.select(); });

function linkify(escaped) {
  return escaped.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"']/g, u => `<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`);
}

/* ---------- theme ---------- */

const themeBtn = $('#themebtn');
function syncTheme() {
  const light = document.documentElement.dataset.theme === 'light';
  themeBtn.setAttribute('aria-checked', String(!light));
  const m = $('meta[name="theme-color"]');
  if (m) m.setAttribute('content', light ? '#f7f8fa' : '#10131a');
}
themeBtn.addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light';
  if (light) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) {}
  syncTheme();
});
syncTheme();

/* ---------- backend ---------- */

let sb = null, user = null, googleOn = false, authReady = Promise.resolve();

function friendly(msg) {
  const m = String(msg || '');
  if (m.startsWith('wyf: ')) return m.slice(5);
  if (/fetch|network|load failed|timeout/i.test(m)) return "Couldn't reach the server. Check your connection and try again.";
  return 'Something went wrong (' + m + ').';
}
async function rpc(fn, args) {
  if (!sb) throw new Error("This page couldn't load everything it needs. Check your connection and reload.");
  const { data, error } = await sb.rpc(fn, args || {});
  if (error) throw new Error(friendly(error.message));
  return data;
}

/* ---------- routing ---------- */

const views = ['loading', 'home', 'event'];
function show(v) { views.forEach(x => { $('#view-' + x).hidden = x !== v; }); }

function parseRoute() {
  const q = new URLSearchParams(location.search);
  const id = q.get('e');
  if (id && /^[A-Za-z0-9]{10}$/.test(id)) {
    // secrets ride in the #fragment so they never reach a server log; they're saved here and then wiped from the address bar
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('admin')) remember(id, { admin: h.get('admin') });
    if (h.get('me')) {
      const [rid, token] = h.get('me').split('.');
      if (rid && token) remember(id, { rid, token, name: null });
    }
    if (location.hash) history.replaceState(null, '', location.pathname + '?e=' + id);
    return { view: 'event', id };
  }
  return { view: 'home' };
}
function go(url) { history.pushState(null, '', url); route(); window.scrollTo(0, 0); }
async function route() {
  const r = parseRoute();
  await authReady;
  if (r.view === 'event') openEvent(r.id); else openHome();
}
window.addEventListener('popstate', route);
$('#homelink').addEventListener('click', e => { if (e.button === 0 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(baseUrl()); } });

/* ---------- the poll form (making and editing) ---------- */

function timeOptions(step, from, to, sel) {
  let h = '';
  for (let m = from; m <= to; m += step) {
    const label = C.clock(m % 1440, false, LOC) + (m === 1440 ? ' (midnight)' : m === 0 ? ' (midnight)' : m === 720 ? ' (noon)' : '');
    h += `<option value="${m}"${m === sel ? ' selected' : ''}>${esc(label)}</option>`;
  }
  return h;
}
const tzLabels = new Map();
function tzOptions(sel, extra) {
  const zones = C.allTimeZones().slice();
  for (const z of [sel, extra, HOME_TZ, 'UTC']) if (z && !zones.includes(z)) zones.push(z);
  const now = Date.now();
  const label = z => { if (!tzLabels.has(z)) tzLabels.set(z, C.tzLabel(z, now)); return tzLabels.get(z); };
  const top = [...new Set([HOME_TZ, extra].filter(Boolean))];
  const opt = z => `<option value="${esc(z)}"${z === sel ? ' selected' : ''}>${esc(label(z))}</option>`;
  return `<optgroup label="Suggested">${top.map(z => opt(z).replace('</option>', z === HOME_TZ ? ' · your time zone</option>' : ' · the poll’s time zone</option>')).join('')}</optgroup>` +
    `<optgroup label="All time zones">${zones.filter(z => !top.includes(z)).map(opt).join('')}</optgroup>`;
}

// draws the create/edit form into `box`; opts: { submit, cancel, onSubmit(values, form), onCancel }
function pollForm(box, init, opts) {
  const uid = 'f' + Math.random().toString(36).slice(2, 7);
  const tz0 = init ? init.tz : HOME_TZ;
  const st = {
    mode: init ? init.mode : 'dates',
    dates: new Set(init && init.mode === 'dates' ? init.days : []),
    weekdays: new Set(init && init.mode === 'week' ? init.days.map(C.weekdayOf) : [1, 2, 3, 4, 5]),
    ref: init && init.mode === 'week' ? init.days[0] : null, // weekly polls keep their reference week, so saved answers still line up
    month: null,
    picker: false, pickYear: 0, // the month and year chooser that opens from the calendar's title
    hours: new Map(),  // specific dates with their own times: 'YYYY-MM-DD' -> [start, end]
    whours: new Map(), // weekly polls: weekday -> [start, end]
    dhOpen: false
  };
  if (init && init.hours) {
    for (const [d, h] of Object.entries(init.hours)) {
      if (init.mode === 'week') st.whours.set(C.weekdayOf(d), h); else st.hours.set(d, h);
    }
    st.dhOpen = Object.keys(init.hours).length > 0;
  }
  const today = C.todayIn(tz0);
  const firstPicked = init && init.mode === 'dates' && init.days.length ? [...init.days].sort()[0] : null;
  st.month = (firstPicked && firstPicked < today ? firstPicked : today).slice(0, 7);
  const minMonth = st.month;
  const step0 = init ? init.step : 30;

  box.innerHTML = `
  <form class="pollform" novalidate>
    <label class="field"><span>What's it for?</span>
      <input name="title" type="text" maxlength="120" required autocomplete="off" enterkeyhint="next" placeholder="Club meeting, study group, dinner…" value="${esc(init ? init.title : '')}"></label>
    <fieldset class="field">
      <legend>Which days?</legend>
      <div class="seg" role="radiogroup" aria-label="Kind of poll">
        <button type="button" role="radio" data-mode="dates">Specific dates</button>
        <button type="button" role="radio" data-mode="week">Days of the week</button>
      </div>
      <div class="daypick"></div>
      <p class="pickcount note" aria-live="polite"></p>
    </fieldset>
    <div class="field">
      <span id="${uid}-tl">Between what times?</span>
      <div class="timerow" role="group" aria-labelledby="${uid}-tl">
        <select name="start" aria-label="Earliest time"></select>
        <span aria-hidden="true">to</span>
        <select name="end" aria-label="Latest time"></select>
      </div>
      <div class="dayhours">
        <button type="button" class="dhtoggle" data-dhtoggle aria-expanded="false" aria-controls="${uid}-dh"></button>
        <div class="dhlist" id="${uid}-dh" role="group" aria-label="Times for specific days" hidden></div>
      </div>
    </div>
    <label class="field"><span>Time zone</span><select name="tz">${tzOptions(tz0)}</select>
      <small class="note">The times above are in this zone. Everyone else sees the poll in their own.</small></label>
    <details class="more"${init && (init.details || init.step !== 30 || init.locked) ? ' open' : ''}>
      <summary>More options</summary>
      <label class="field"><span>Description <i>(optional)</i></span><textarea name="details" rows="3" maxlength="1000" placeholder="Where it is, what to bring, anything people should know">${esc(init ? init.details : '')}</textarea></label>
      <label class="field"><span>Time slots</span><select name="step"><option value="15">Every 15 minutes</option><option value="30">Every 30 minutes</option><option value="60">Every hour</option></select></label>
      <div class="field">
        <label for="${uid}-pw">Poll password <i>(optional)</i></label>
        <input id="${uid}-pw" name="password" type="password" maxlength="72" autocomplete="new-password" placeholder="${init && init.locked ? 'Leave blank to keep the current password' : ''}">
        ${init && init.locked ? '<label class="check"><input type="checkbox" name="nopass"> Remove the password</label>' : ''}
        <small class="note">With a password, only people who know it can open the poll. Without one, anyone with the link can.</small>
      </div>
    </details>
    <p class="formerr" role="alert" hidden></p>
    <div class="formactions"><button type="submit" class="btn primary big">${esc(opts.submit)}</button>${opts.cancel ? '<button type="button" class="btn ghost" data-cancel>Cancel</button>' : ''}</div>
  </form>`;

  const form = box.querySelector('form');
  const F = form.elements;
  F.step.value = String(step0);

  const inc = () => Math.min(+F.step.value, 60);
  const snap = ([s, e]) => { const i = inc(); const a = Math.floor(s / i) * i, b = Math.min(1440, Math.ceil(e / i) * i); return [a, b > a ? b : Math.min(1440, a + i)]; };

  function drawTimes(keepStart, keepEnd) {
    const i = inc();
    const s = Math.floor(keepStart / i) * i, e = Math.min(1440, Math.ceil(keepEnd / i) * i);
    F.start.innerHTML = timeOptions(i, 0, 1440 - i, s);
    F.end.innerHTML = timeOptions(i, i, 1440, e > s ? e : Math.min(1440, s + i));
  }
  drawTimes(init ? init.start : 540, init ? init.end : 1020);
  F.step.addEventListener('change', () => { drawTimes(+F.start.value, +F.end.value); drawHours(); });
  F.start.addEventListener('change', () => { if (+F.end.value <= +F.start.value) { const i = inc(); drawTimes(+F.start.value, Math.min(1440, +F.start.value + 4 * 60 - (4 * 60) % i)); } drawHours(); });
  F.end.addEventListener('change', drawHours);

  const wdName = (wd, style) => new Intl.DateTimeFormat(LOC, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + wd))); // Jan 1 2023 was a Sunday
  const order = [0, 1, 2, 3, 4, 5, 6].map(i => (i + FIRST_DAY) % 7);
  const ymOf = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const chev = d => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function drawDays() {
    $$('.seg [data-mode]', form).forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === st.mode)));
    const pick = $('.daypick', form), count = $('.pickcount', form);
    if (st.mode === 'week') {
      pick.innerHTML = `<div class="wkpick" role="group" aria-label="Days of the week">${order.map(wd =>
        `<button type="button" class="wd" data-wd="${wd}" aria-pressed="${st.weekdays.has(wd)}"><span aria-hidden="true">${esc(wdName(wd, 'short'))}</span><span class="sr-only">${esc(wdName(wd, 'long'))}</span></button>`).join('')}</div>`;
      const n = st.weekdays.size;
      count.textContent = n ? `Every ${order.filter(w => st.weekdays.has(w)).map(w => wdName(w, 'long')).join(', ')}` : 'Pick at least one day.';
      drawHours();
      return;
    }
    const [y, m] = st.month.split('-').map(Number);
    const first = `${st.month}-01`;
    const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = (C.weekdayOf(first) - FIRST_DAY + 7) % 7;
    const monthOnly = new Intl.DateTimeFormat(LOC, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
    const monthName = new Intl.DateTimeFormat(LOC, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
    const todayNow = C.todayIn(F.tz.value);
    const maxMonth = C.addDays(todayNow, 400).slice(0, 7);
    const minYear = +minMonth.slice(0, 4), maxYear = +maxMonth.slice(0, 4);
    let body;
    if (st.picker) {
      const py = st.pickYear;
      const short = new Intl.DateTimeFormat(LOC, { month: 'short', timeZone: 'UTC' });
      let months = '';
      for (let i = 1; i <= 12; i++) {
        const ym = ymOf(py, i);
        const off = ym < minMonth || ym > maxMonth;
        const picked = [...st.dates].some(d => d.startsWith(ym));
        months += `<button type="button" class="mpm${ym === st.month ? ' cur' : ''}${picked ? ' has' : ''}" data-pmonth="${ym}"${off ? ' disabled' : ''}${ym === st.month ? ' aria-current="true"' : ''}>${esc(short.format(new Date(Date.UTC(py, i - 1, 1))))}</button>`;
      }
      body = `<div class="mpick" role="group" aria-label="Choose a month in ${py}">${months}</div>`;
    } else {
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<span class="dpad" aria-hidden="true"></span>';
      for (let d = 1; d <= nDays; d++) {
        const ds = `${st.month}-${String(d).padStart(2, '0')}`;
        const on = st.dates.has(ds), past = ds < todayNow;
        const label = new Intl.DateTimeFormat(LOC, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
        cells += `<button type="button" class="dday${ds === todayNow ? ' today' : ''}" data-date="${ds}" aria-pressed="${on}" aria-label="${esc(label)}"${past && !on ? ' disabled' : ''}>${d}</button>`;
      }
      body = `<div class="calgrid"><div class="calwd" aria-hidden="true">${order.map(wd => `<span>${esc(wdName(wd, 'narrow'))}</span>`).join('')}</div><div class="caldays" role="group" aria-label="${esc(monthName)}">${cells}</div></div>`;
    }
    const prevOff = st.picker ? st.pickYear <= minYear : st.month <= minMonth;
    const nextOff = st.picker ? st.pickYear >= maxYear : st.month >= maxMonth;
    pick.innerHTML = `<div class="cal${st.picker ? ' picking' : ''}">
      <div class="calhead">
        <button type="button" class="caltitle" data-picker aria-expanded="${st.picker}" title="${st.picker ? 'Back to the days' : 'Choose a month and year'}">
          <span aria-live="polite">${st.picker ? `<b>${st.pickYear}</b>` : `<b>${esc(monthOnly)}</b> <span class="calyear">${y}</span>`}</span>${chev('M7 10l5 5 5-5')}
          <span class="sr-only">${st.picker ? ', close the month list' : ', choose a different month or year'}</span></button>
        <div class="calnav">
          <button type="button" class="calarrow" data-month="-1" aria-label="${st.picker ? 'Previous year' : 'Previous month'}"${prevOff ? ' disabled' : ''}>${chev('M15 5l-7 7 7 7')}</button>
          <button type="button" class="calarrow" data-month="1" aria-label="${st.picker ? 'Next year' : 'Next month'}"${nextOff ? ' disabled' : ''}>${chev('M9 5l7 7-7 7')}</button>
        </div>
      </div>
      ${body}
    </div>`;
    const n = st.dates.size;
    count.innerHTML = n ? `${plural(n, 'day')} picked · <button type="button" class="linkbtn" data-clear>Clear</button>` : 'Tap or drag across the dates you’re considering.';
    drawHours();
  }

  // days with their own times
  function dayList() {
    if (st.mode === 'week') return order.filter(w => st.weekdays.has(w)).map(w => ({ key: 'w' + w, label: wdName(w, 'long') }));
    const f = new Intl.DateTimeFormat(LOC, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    return [...st.dates].sort().map(d => { const [y, m, dd] = d.split('-').map(Number); return { key: d, label: f.format(new Date(Date.UTC(y, m - 1, dd))) }; });
  }
  const ownHours = key => key[0] === 'w' ? st.whours.get(+key.slice(1)) : st.hours.get(key);
  const general = () => [+F.start.value, +F.end.value];
  function setOwn(key, h) {
    const g = general(), same = h && h[0] === g[0] && h[1] === g[1];
    const map = key[0] === 'w' ? st.whours : st.hours, k = key[0] === 'w' ? +key.slice(1) : key;
    if (!h || same) map.delete(k); else map.set(k, h);
  }
  function drawHours() {
    const btn = $('[data-dhtoggle]', form), list = $('.dhlist', form);
    const days = dayList();
    const custom = days.filter(d => ownHours(d.key)).length;
    btn.setAttribute('aria-expanded', String(st.dhOpen));
    btn.innerHTML = st.dhOpen ? `${chev('M7 14l5-5 5 5')}Times for specific days${custom ? ` <span class="tag">${custom} changed</span>` : ''}`
      : `${chev('M12 5v14M5 12h14')}Set different times for specific days`;
    list.hidden = !st.dhOpen;
    if (!st.dhOpen) return;
    if (!days.length) { list.innerHTML = '<p class="note">Pick some days first, then give any of them their own times.</p>'; return; }
    const i = inc();
    list.innerHTML = days.map(d => {
      const own = ownHours(d.key);
      const [s, e] = own ? snap(own) : general();
      return `<div class="dhrow${own ? ' own' : ''}" data-day="${esc(d.key)}">
        <span class="dhday">${esc(d.label)}</span>
        <select data-dh="s" aria-label="${esc(d.label)}, earliest time">${timeOptions(i, 0, 1440 - i, s)}</select>
        <span class="dhto" aria-hidden="true">to</span>
        <select data-dh="e" aria-label="${esc(d.label)}, latest time">${timeOptions(i, i, 1440, e)}</select>
        ${own ? `<button type="button" class="iconbtn" data-dhreset aria-label="Use the general times for ${esc(d.label)}" title="Use the general times">${ICON.x}</button>` : '<span class="dhsame">Default</span>'}
      </div>`;
    }).join('') + `<p class="note dhnote">Days you don’t change use ${esc(C.clock(general()[0], false, LOC))} to ${esc(C.clock(general()[1] % 1440, false, LOC))}. <button type="button" class="linkbtn" data-dhoff>Use the same times every day</button></p>`;
  }
  drawDays();

  // dates: tap to toggle, or drag to set every date from where you pressed to where you are
  // (a range, so a quick swipe that skips over a day still gets it)
  let dsel = null;
  form.addEventListener('pointerdown', e => {
    const b = e.target.closest('.dday');
    if (!b || b.disabled || e.button > 0) return;
    e.preventDefault();
    dsel = { add: !st.dates.has(b.dataset.date), pid: e.pointerId, anchor: b.dataset.date, at: '', before: new Set(st.dates) };
    try { form.setPointerCapture(e.pointerId); } catch (x) {}
    rangeTo(b.dataset.date);
  });
  form.addEventListener('pointermove', e => {
    if (!dsel || e.pointerId !== dsel.pid) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const b = el && el.closest && el.closest('.dday');
    if (b && !b.disabled && form.contains(b)) rangeTo(b.dataset.date);
  });
  const endSel = () => { if (dsel) { dsel = null; drawDays(); } };
  form.addEventListener('pointerup', endSel);
  form.addEventListener('pointercancel', endSel);
  function rangeTo(ds) {
    if (ds === dsel.at) return;
    dsel.at = ds;
    const [a, b] = [dsel.anchor, ds].sort();
    const todayNow = C.todayIn(F.tz.value);
    st.dates = new Set(dsel.before);
    for (let d = a, n = 0; d <= b && n < 400; d = C.addDays(d, 1), n++) {
      if (dsel.add) { if (d >= todayNow && st.dates.size < 62) st.dates.add(d); } else st.dates.delete(d);
    }
    $$('.dday', form).forEach(x => x.setAttribute('aria-pressed', String(st.dates.has(x.dataset.date))));
  }

  const refocus = sel => { const again = $(sel, form); if (again) again.focus(); };
  function moveMonth(by) {
    const [y, m] = st.month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    st.month = ymOf(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  form.addEventListener('click', e => {
    const t = e.target;
    const modeBtn = t.closest('[data-mode]');
    if (modeBtn) { st.mode = modeBtn.dataset.mode; st.picker = false; drawDays(); return; }
    if (t.closest('[data-picker]')) { st.picker = !st.picker; st.pickYear = +st.month.slice(0, 4); drawDays(); refocus('[data-picker]'); return; }
    const pm = t.closest('[data-pmonth]');
    if (pm) { st.month = pm.dataset.pmonth; st.picker = false; drawDays(); refocus('[data-picker]'); return; }
    const mb = t.closest('[data-month]');
    if (mb) {
      if (st.picker) st.pickYear += +mb.dataset.month; else moveMonth(+mb.dataset.month);
      drawDays();
      refocus(`[data-month="${mb.dataset.month}"]:not(:disabled)`);
      return;
    }
    const day = t.closest('.dday');
    if (day && e.detail === 0 && !day.disabled) { // keyboard: pointer taps were handled on pointerdown
      const ds = day.dataset.date;
      if (st.dates.has(ds)) st.dates.delete(ds); else if (st.dates.size < 62) st.dates.add(ds);
      drawDays(); refocus(`.dday[data-date="${ds}"]`); return;
    }
    const wd = t.closest('[data-wd]');
    if (wd) { const w = +wd.dataset.wd; if (st.weekdays.has(w)) st.weekdays.delete(w); else st.weekdays.add(w); drawDays(); refocus(`[data-wd="${w}"]`); return; }
    if (t.closest('[data-clear]')) { st.dates.clear(); drawDays(); return; }
    if (t.closest('[data-dhtoggle]')) { st.dhOpen = !st.dhOpen; drawHours(); refocus('[data-dhtoggle]'); return; }
    if (t.closest('[data-dhoff]')) { st.hours.clear(); st.whours.clear(); st.dhOpen = false; drawHours(); refocus('[data-dhtoggle]'); return; }
    const rs = t.closest('[data-dhreset]');
    if (rs) { const key = rs.closest('.dhrow').dataset.day; setOwn(key, null); drawHours(); refocus(`.dhrow[data-day="${CSS.escape(key)}"] [data-dh="s"]`); return; }
    if (t.closest('[data-cancel]') && opts.onCancel) opts.onCancel();
  });
  form.addEventListener('change', e => {
    const sel = e.target.closest('[data-dh]');
    if (!sel) return;
    const key = sel.closest('.dhrow').dataset.day;
    let [s, en] = ownHours(key) ? snap(ownHours(key)) : general();
    if (sel.dataset.dh === 's') { s = +sel.value; if (en <= s) en = Math.min(1440, s + Math.max(inc(), 60)); } else en = +sel.value;
    if (en <= s) s = Math.max(0, en - inc());
    setOwn(key, [s, en]);
    drawHours();
    refocus(`.dhrow[data-day="${CSS.escape(key)}"] [data-dh="${sel.dataset.dh}"]`);
  });
  form.addEventListener('keydown', e => {
    // radio group arrows
    const b = e.target.closest('.seg [data-mode]');
    if (b && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault(); st.mode = st.mode === 'dates' ? 'week' : 'dates'; drawDays(); refocus(`.seg [data-mode="${st.mode}"]`); return;
    }
    // Escape closes the month list; Page Up / Page Down move a month from anywhere in the calendar
    if (e.target.closest('.cal')) {
      if (e.key === 'Escape' && st.picker) { e.preventDefault(); e.stopPropagation(); st.picker = false; drawDays(); refocus('[data-picker]'); }
      if ((e.key === 'PageUp' || e.key === 'PageDown') && !st.picker) { e.preventDefault(); const n = $(`[data-month="${e.key === 'PageUp' ? -1 : 1}"]`, form); if (n && !n.disabled) n.click(); }
    }
  });
  F.tz.addEventListener('change', drawDays);

  function values() {
    const title = F.title.value.trim().replace(/\s+/g, ' ');
    const step = +F.step.value, start = +F.start.value, end = +F.end.value, tz = F.tz.value;
    const days = st.mode === 'week'
      ? C.weekDates([...st.weekdays], st.ref || C.todayIn(tz))
      : [...st.dates].sort();
    const hours = {};
    for (const d of days) {
      const own = st.mode === 'week' ? st.whours.get(C.weekdayOf(d)) : st.hours.get(d);
      if (!own) continue;
      const [s, e] = snap(own);
      if (e > s && !(s === start && e === end)) hours[d] = [s, e];
    }
    let err = '';
    if (!title) err = 'Give the poll a name.';
    else if (!days.length) err = 'Pick at least one day.';
    else if (end <= start) err = 'The end time has to be after the start time.';
    else if (C.slotCount({ days, start, end, step, hours }) > 2000) err = 'That’s a lot of time slots. Pick fewer days, a shorter window, or longer slots.';
    return { err, v: { title, details: F.details.value.trim(), mode: st.mode, days, start, end, step, tz, hours, password: F.password.value, nopass: !!(F.nopass && F.nopass.checked) } };
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const { err, v } = values();
    const box2 = $('.formerr', form);
    if (err) { box2.textContent = err; box2.hidden = false; if (!v.title) F.title.focus(); return; }
    box2.hidden = true;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try { await opts.onSubmit(v); } catch (x) { box2.textContent = x.message; box2.hidden = false; }
    btn.disabled = false;
  });

  return {
    reset() { form.reset(); st.dates.clear(); st.hours.clear(); st.whours.clear(); st.dhOpen = false; st.picker = false; st.mode = 'dates'; F.step.value = '30'; drawTimes(540, 1020); F.tz.value = HOME_TZ; drawDays(); },
    focus() { F.title.focus(); }
  };
}

/* ---------- home ---------- */

let homeForm = null;
function openHome() {
  stopPolling();
  S.view = 'home'; S.id = null; S.ev = null;
  show('home');
  document.title = 'WhenUFree | Find a time that works for everyone';
  if (!homeForm) homeForm = pollForm($('#createbox'), null, { submit: 'Create poll', onSubmit: createPoll });
  renderMyPolls();
}

async function createPoll(v) {
  const res = await rpc('wyf_create_event', { p: { title: v.title, details: v.details, mode: v.mode, days: v.days, start: v.start, end: v.end, step: v.step, tz: v.tz, hours: v.hours, password: v.password || null } });
  remember(res.id, { title: v.title, admin: res.admin, organizer: true, mode: v.mode, days: v.days, tz: v.tz, created: Date.now(), pass: v.password || null, seenIds: [] });
  if (homeForm) homeForm.reset();
  go(pollUrl(res.id));
  showAdminLink(res.id, res.admin, true);
}

// the organizer link, with its secret end blurred: it can only be taken with the Copy button
function secretRow(base, secret, label) {
  return `<div class="secretrow"><div class="secretlink" role="img" aria-label="${esc(label)}, hidden. Use Copy to copy it.">
      <span class="sl-base">${esc(base.replace(/^https?:\/\//, ''))}</span><span class="sl-secret" aria-hidden="true">${esc(secret)}</span></div>
    <button type="button" class="btn sm" data-copy="${esc(base + secret)}">${ICON.copy}Copy</button></div>`;
}

function shareButtons(url, title) {
  const text = `When are you free for “${title}”? Add your times here: ${url}`;
  return `<div class="sharebtns">
    ${navigator.share ? `<button type="button" class="btn sm" data-share="${esc(url)}" data-title="${esc(title)}">${ICON.share}Share</button>` : ''}
    <a class="btn sm" href="mailto:?subject=${encodeURIComponent('When are you free? ' + title)}&amp;body=${encodeURIComponent(text)}">${ICON.mail}Email</a>
    <a class="btn sm" href="sms:?&amp;body=${encodeURIComponent(text)}">${ICON.chat}Text</a>
  </div>`;
}

function showAdminLink(id, token, fresh) {
  const url = pollUrl(id), title = (known()[id] || {}).title || (S.ev && S.ev.id === id ? S.ev.title : '');
  openDialog(fresh ? 'Your poll is ready' : 'Organizer link', `
    ${fresh ? `<div class="readyhero">
      <img class="readylogo" src="assets/logo.svg" alt="" width="56" height="56">
      <div><p class="readykicker">${ICON.check}Poll created</p><p class="readytitle">${esc(title || 'Your poll')}</p></div>
    </div>
    <div class="readystep">
      <h3><span class="stepno" aria-hidden="true">1</span>Send this link to your group</h3>
      <div class="biglink">${copyRow(url, 'Link for your group', true)}</div>
      ${shareButtons(url, title)}
    </div>` : ''}
    <div class="readystep keep">
      <h3>${fresh ? '<span class="stepno" aria-hidden="true">2</span>Save your organizer link' : 'Your organizer link'}</h3>
      <p>It lets you edit the poll, pick the final time and remove answers.${user ? ' The poll is also saved to your account, so you can get back to it from any device where you sign in.' : ' This browser remembers it, but if you switch devices or clear your browsing data, this link is the only way back in as the organizer.'} Keep it to yourself, or give it to a co-organizer.</p>
      ${secretRow(url + '#admin=', token, 'Organizer link')}
    </div>
    ${!user && googleOn ? '<p class="note">Or <button type="button" class="linkbtn" data-signin>sign in with Google</button> to keep your polls on every device.</p>' : ''}
    <div class="dlgactions"><button type="button" class="btn primary" data-done>${fresh ? 'I’ve saved it' : 'Done'}</button></div>`,
  b => { b.querySelector('[data-done]').onclick = closeDialog; const s = b.querySelector('[data-signin]'); if (s) s.onclick = openAccount; }, { cls: fresh ? 'ready' : '' });
}
function whenSummary(p) {
  if (!p.days || !p.days.length) return '';
  return C.daysSummary(p, LOC);
}

async function renderMyPolls() {
  const card = $('#mypolls-card'), list = $('#mypolls');
  const draw = rows => {
    card.hidden = !rows.length;
    rows.sort((a, b) => (b.activity || 0) - (a.activity || 0));
    list.innerHTML = rows.map(r => {
      const fresh = r.organizer && r.count != null && r.count > (r.seenCount || 0) ? r.count - (r.seenCount || 0) : 0;
      return `<li class="pollrow">
        <a href="${esc(pollUrl(r.id))}" data-go="${esc(r.id)}"><b>${esc(r.title || 'Untitled poll')}</b>
          <span class="meta">${esc(whenSummary(r))}${r.count != null ? ' · ' + esc(plural(r.count, 'response')) : ''}</span></a>
        <span class="tags">${fresh ? `<span class="tag new">${fresh} new</span>` : ''}${r.final ? '<span class="tag ok">Time picked</span>' : ''}${r.organizer ? '<span class="tag">Organizer</span>' : r.answered ? '<span class="tag">Answered</span>' : ''}</span>
        ${r.local && !r.account ? `<button type="button" class="iconbtn" data-forget="${esc(r.id)}" aria-label="Remove ${esc(r.title || 'this poll')} from this list" title="Remove from this list (the poll itself stays)">${ICON.x}</button>` : ''}
      </li>`;
    }).join('');
  };
  const local = known();
  const rows = new Map();
  for (const k of Object.values(local)) {
    rows.set(k.id, { id: k.id, title: k.title, organizer: !!(k.admin || k.organizer), answered: !!k.rid, mode: k.mode, days: k.days, count: k.count, seenCount: k.seenCount, final: !!k.final, local: true, activity: k.activity ? Date.parse(k.activity) : (k.lastOpen || k.created || 0) });
  }
  draw([...rows.values()]);
  renderClaimBanner();
  if (!sb) return;
  try {
    const ids = Object.keys(local).slice(0, 50);
    const [acct, status] = await Promise.all([
      user ? rpc('wyf_my_polls') : Promise.resolve([]),
      ids.length ? rpc('wyf_poll_status', { p_ids: ids }) : Promise.resolve([])
    ]);
    const alive = new Set(status.map(s => s.id));
    for (const id of ids) if (!alive.has(id) && !acct.some(a => a.id === id)) { forgetPoll(id); rows.delete(id); } // deleted or expired
    for (const s of status) { const r = rows.get(s.id); if (r) Object.assign(r, { count: s.count, final: s.final, activity: Date.parse(s.activity) }); remember(s.id, { count: s.count, final: s.final }); }
    for (const a of acct) {
      const r = rows.get(a.id) || { id: a.id, seenCount: (local[a.id] || {}).seenCount };
      Object.assign(r, { title: a.title, mode: a.mode, days: a.days, count: a.count, final: a.final, organizer: a.organizer || r.organizer, answered: !!a.rid || r.answered, account: true, activity: Date.parse(a.activity) });
      rows.set(a.id, r);
    }
    if (S.view === 'home') draw([...rows.values()]);
  } catch (e) { /* the list still works from this browser's memory */ }
}
$('#mypolls').addEventListener('click', e => {
  const f = e.target.closest('[data-forget]');
  if (f) { forgetPoll(f.dataset.forget); renderMyPolls(); toast('Removed from this list. The poll itself is still there for everyone else.'); return; }
  const a = e.target.closest('[data-go]');
  if (a && e.button === 0 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(pollUrl(a.dataset.go)); }
});

/* ---------- one poll: state ---------- */

const S = {
  view: 'loading', id: null, ev: null, lastSig: '', lay: null, laySig: '', keySet: new Set(), labels: new Map(),
  tz: HOME_TZ, admin: null, pass: null,
  me: null,            // { rid, token, name } when this browser (or account) has answered
  mine: null,          // { avail: Set, maybe: Set, note } — my answers as edited here
  dirty: false, saving: false, saveAgain: false, saveState: '', saveErr: '',
  paint: 'yes', kbTarget: null, tab: 'mine', mineMode: '',
  only: new Set(),     // people the group view is narrowed to (empty = everyone)
  focusKey: null, pinned: false, hl: null, busy: new Set(), newNames: [], gone: false
};

function resetPollState(id) {
  Object.assign(S, { id, ev: null, lastSig: '', lay: null, laySig: '', labels: new Map(), tz: HOME_TZ, me: null, mine: null,
    dirty: false, saving: false, saveAgain: false, saveState: '', paint: 'yes', mineMode: '', only: new Set(),
    focusKey: null, pinned: false, hl: null, busy: new Set(store.get('wyf.busy.' + id, [])), newNames: [], gone: false, tab: 'mine' });
}

async function openEvent(id) {
  if (S.id !== id || !S.ev) resetPollState(id);
  S.view = 'event';
  const k = known()[id] || {};
  S.admin = k.admin || null;
  S.pass = k.pass || null;
  const before = S.me && S.me.rid;
  S.me = k.rid ? { rid: k.rid, token: k.token || null, name: k.name || '' } : null;
  if ((S.me && S.me.rid) !== before) { S.mine = null; S.dirty = false; }
  // who "I am" may have just changed (a personal or organizer link opened in this same tab), so redraw everything
  S.lastSig = ''; S.mineMode = '';
  if (!S.ev) { show('loading'); }
  await load();
  startPolling();
}

async function load(quiet) {
  if (!S.id) return;
  const id = S.id;
  let ev;
  try { ev = await rpc('wyf_get_event', { p_id: id, p_admin: S.admin, p_password: S.pass }); }
  catch (e) { if (!quiet && S.id === id) renderProblem('Couldn’t open this poll', e.message, true); return; }
  if (S.id !== id || S.view !== 'event') return;
  if (ev.error === 'not_found') { forgetPoll(id); renderProblem('This poll isn’t here', 'It may have been deleted by its organizer, or removed 90 days after its last activity.'); return; }
  if (ev.error === 'password') { renderGate(ev.tried); return; }
  applyEvent(ev);
}

let pollTimer = 0;
function startPolling() { stopPolling(); pollTimer = setInterval(() => { if (document.visibilityState === 'visible' && !drag && !S.saving && !dlg.open) load(true); }, POLL_EVERY); }
function stopPolling() { clearInterval(pollTimer); }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.view === 'event' && !drag) load(true);
  if (document.visibilityState === 'hidden' && S.dirty) save();
});
window.addEventListener('beforeunload', e => { if (S.dirty || S.saving) { save(); e.preventDefault(); e.returnValue = ''; } });

function layoutSig(ev) { return [ev.mode, ev.days.join(','), ev.start, ev.end, ev.step, ev.tz, JSON.stringify(ev.hours || {})].join('|'); }

function applyEvent(ev) {
  const first = !S.ev;
  const sig = JSON.stringify(ev);
  if (!first && sig === S.lastSig) return; // nothing changed since the last look
  S.lastSig = sig;
  S.ev = ev;
  S.gone = false;
  if (S.admin && !ev.admin) { remember(S.id, { admin: null }); S.admin = null; } // that admin link no longer works
  const byAccount = ev.responses.find(r => r.mine);
  if (byAccount) S.me = { rid: byAccount.id, token: S.me && S.me.rid === byAccount.id ? S.me.token : null, name: byAccount.name, account: true };
  if (S.me && !ev.responses.some(r => r.id === S.me.rid)) {
    if (!first) toast('Your answers were removed from this poll by the organizer.');
    S.me = null; S.mine = null; S.dirty = false;
    remember(S.id, { rid: null, token: null, name: null });
  }
  if (S.me) {
    const r = ev.responses.find(x => x.id === S.me.rid);
    S.me.name = r.name;
    S.me.protected = r.protected;
    if (!S.dirty && !S.saving) S.mine = { avail: new Set(r.avail), maybe: new Set(r.maybe), note: r.note };
  }
  const prev = known()[S.id] || {};
  if (first) {
    const seen = prev.seenIds;
    S.newNames = seen ? ev.responses.filter(r => !seen.includes(r.id) && !(S.me && r.id === S.me.rid)).map(r => r.name) : [];
    // on phones, start where the action is: your grid until you've answered, then everyone's
    if (S.me && S.mine && (S.mine.avail.size || S.mine.maybe.size)) S.tab = 'group';
    if (ev.final || (ev.admin && !S.me && ev.responses.length)) S.tab = 'group';
  }
  remember(S.id, {
    title: ev.title, mode: ev.mode, days: ev.days, tz: ev.tz, organizer: !!ev.admin, final: !!ev.final,
    rid: S.me ? S.me.rid : null, name: S.me ? S.me.name : null, count: ev.responses.length,
    seenIds: ev.responses.map(r => r.id), seenCount: ev.responses.length, lastOpen: Date.now(), activity: ev.updated
  });
  const ls = layoutSig(ev) + '|' + S.tz;
  let rebuild = false;
  if (ls !== S.laySig) {
    S.lay = C.layout(ev, S.tz, FIRST_DAY);
    S.laySig = ls;
    S.keySet = new Set(S.lay.keys);
    S.labels = new Map();
    rebuild = true;
  }
  document.title = ev.title + ' | WhenUFree';
  show('event');
  $('#ev-gate').innerHTML = '';
  $('#ev-body').hidden = false;
  renderEvent(rebuild);
}

function slotText(k) {
  let t = S.labels.get(k);
  if (!t) { t = C.slotLabel(k, S.tz, S.ev.mode, LOC); S.labels.set(k, t); }
  return t;
}

// everyone's answers, with mine as edited here (so the group view keeps up while I drag)
function people() {
  return S.ev.responses.map(r => {
    if (S.me && S.mine && r.id === S.me.rid) return { id: r.id, name: r.name, note: S.mine.note, avail: [...S.mine.avail], maybe: [...S.mine.maybe] };
    return { id: r.id, name: r.name, note: r.note, avail: r.avail, maybe: r.maybe };
  });
}
const nameOf = id => { const r = S.ev.responses.find(x => x.id === id); return r ? r.name : ''; };
const nameList = ids => {
  const n = ids.map(nameOf).filter(Boolean);
  if (n.length <= 2) return n.join(' and ');
  return n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
};

/* ---------- rendering a poll ---------- */

function keepFocus(fn) {
  const a = document.activeElement;
  let sel = null;
  if (a && a !== document.body && $('#ev-body').contains(a)) {
    if (a.id) sel = '#' + CSS.escape(a.id);
    else {
      const attrs = ['data-k', 'data-act', 'data-pid', 'data-paint', 'data-s'].filter(x => a.hasAttribute(x));
      if (attrs.length) sel = attrs.map(x => `[${x}="${CSS.escape(a.getAttribute(x))}"]`).join('');
      if (sel && a.closest('[id^="pane-"]')) sel = '#' + a.closest('[id^="pane-"]').id + ' ' + sel;
    }
  }
  fn();
  if (sel) { const b = $(sel); if (b && b !== document.activeElement) b.focus({ preventScroll: true }); }
}

function renderEvent(rebuild) {
  keepFocus(() => {
    renderHead(); renderFinal(); renderOrg(); renderTz(); renderTabs();
    renderMine(rebuild); renderGroup(rebuild);
  });
}

function renderProblem(title, text, retry) {
  show('event');
  $('#ev-body').hidden = true;
  $('#ev-gate').innerHTML = `<div class="card problem"><h1>${esc(title)}</h1><p>${esc(text)}</p><div class="formactions">${retry ? '<button type="button" class="btn primary" data-act="retry">Try again</button>' : ''}<a class="btn ${retry ? 'ghost' : 'primary'}" href="./" data-act="home">Make a new poll</a></div></div>`;
  document.title = title + ' | WhenUFree';
}

function renderGate(tried) {
  show('event');
  $('#ev-body').hidden = true;
  if (tried && S.pass) { S.pass = null; remember(S.id, { pass: null }); }
  $('#ev-gate').innerHTML = `<div class="card problem"><h1>This poll has a password</h1>
    <p>Ask the person who sent you the link for it.</p>
    <form class="gateform" data-form="gate"><label class="field"><span>Poll password</span><input type="password" name="pw" autocomplete="current-password" required autofocus></label>
    ${tried ? '<p class="formerr" role="alert">That password isn’t right.</p>' : ''}
    <div class="formactions"><button type="submit" class="btn primary">Open poll</button></div></form>
    ${!user && googleOn ? '<p class="note">Organizer? <button type="button" class="linkbtn" data-act="signin">Sign in</button> or use your organizer link.</p>' : ''}</div>`;
  const i = $('#ev-gate input'); if (i) i.focus();
  document.title = 'Password needed | WhenUFree';
}

function renderHead() {
  const ev = S.ev, n = ev.responses.length;
  const bare = n <= 1 && ev.admin;
  $('#ev-head').innerHTML = `
    <p class="eyebrow">${esc(ev.mode === 'week' ? 'Weekly' : 'Poll')} · ${esc(C.daysSummary(ev, LOC))}</p>
    <h1>${esc(ev.title)}</h1>
    ${ev.details ? `<p class="details">${linkify(esc(ev.details)).replace(/\n/g, '<br>')}</p>` : ''}
    ${bare ? `<div class="sendbanner">
      <div class="sb-text"><p class="sb-title">Send this link to your group</p><p class="sb-sub">Everyone adds their own times. No sign-up, any phone, their own time zone.</p></div>
      <div class="sb-link">${copyRow(pollUrl(ev.id), 'Link to this poll', true)}${shareButtons(pollUrl(ev.id), ev.title)}</div>
    </div>` : `<div class="sharebar">
      ${copyRow(pollUrl(ev.id), 'Link to this poll')}
      ${navigator.share ? `<button type="button" class="btn sm" data-act="share">${ICON.share}Share</button>` : ''}
    </div>`}`;
}

function finalRange() {
  const ev = S.ev;
  if (!ev.final) return null;
  let [s, e] = ev.final;
  return { s, e, weekly: ev.mode === 'week' };
}

function renderFinal() {
  const box = $('#ev-final'), f = finalRange();
  if (!f) { box.innerHTML = ''; return; }
  const ev = S.ev;
  const lab = C.rangeLabel(f.s, f.e, S.tz, ev.mode, LOC);
  const ps = people();
  const ok = ps.filter(p => slotsBetween(f.s, f.e).every(k => p.avail.includes(k) || p.maybe.includes(k)));
  box.innerHTML = `<section class="final card" aria-labelledby="final-h">
    <p class="eyebrow">${ICON.check} It’s set</p>
    <h2 id="final-h">${esc(f.weekly ? 'Every ' + lab.day : lab.day)}</h2>
    <p class="finaltime">${esc(lab.time)} <span>${esc(S.tz === HOME_TZ ? 'your time' : C.tzLabel(S.tz))}</span></p>
    ${ps.length ? `<p class="note">${ok.length === ps.length ? 'Everyone who answered can make it.' : `${ok.length} of ${ps.length} can make all of it.${ps.length - ok.length ? ' Not free: ' + esc(nameList(ps.filter(p => !ok.includes(p)).map(p => p.id))) + '.' : ''}`}</p>` : ''}
    <div class="calbtns">
      <a class="btn sm" data-act="gcal" href="#" target="_blank" rel="noopener">${ICON.cal}Google Calendar</a>
      <a class="btn sm" data-act="ocal" href="#" target="_blank" rel="noopener">${ICON.cal}Outlook</a>
      <button type="button" class="btn sm" data-act="ics">${ICON.cal}Apple / other (.ics)</button>
    </div>
    ${ev.admin ? '<div class="finaladmin"><button type="button" class="btn ghost sm" data-act="finalize">Change the time</button><button type="button" class="btn ghost sm" data-act="reopen">Reopen the poll</button></div>' : ''}
  </section>`;
  const o = calEvent();
  $('[data-act="gcal"]', box).href = I.googleLink(o);
  $('[data-act="ocal"]', box).href = I.outlookLink(o);
}

function calEvent() {
  const ev = S.ev, f = finalRange();
  let [s, e] = [f.s, f.e];
  if (f.weekly) [s, e] = C.nextWeekly(s, e, ev.tz);
  return { uid: `${ev.id}-${f.s}@jackjaillet.com`, title: ev.title, details: ev.details, url: pollUrl(ev.id), start: s, end: e, weekly: f.weekly };
}

function slotsBetween(s, e) { return S.lay.keys.filter(k => k >= s && k < e); }

function renderOrg() {
  const box = $('#ev-org'), ev = S.ev;
  if (!ev.admin) { box.innerHTML = ''; return; }
  const n = ev.responses.length;
  box.innerHTML = `<section class="orgbar" aria-label="Organizer tools">
    <p><b>You’re the organizer.</b> ${S.newNames.length ? `New since you last looked: ${esc(S.newNames.join(', '))}.` : n ? esc(plural(n, 'person has', 'people have')) + ' answered.' : 'No answers yet.'}</p>
    <div class="orgactions">
      ${ev.final ? '' : `<button type="button" class="btn sm primary" data-act="finalize"${n ? '' : ' disabled title="Wait for some answers first"'}>Pick the final time</button>`}
      <button type="button" class="btn sm" data-act="edit">Edit poll</button>
      <button type="button" class="btn sm" data-act="duplicate">Duplicate</button>
      ${S.admin ? '<button type="button" class="btn sm" data-act="adminlink">Organizer link</button>' : ''}
      <button type="button" class="btn sm ghost danger" data-act="delete">Delete poll</button>
    </div>
  </section>`;
}

function renderTz() {
  const ev = S.ev;
  const at = S.lay.keys[0] * 60000;
  const differs = C.offsetMin(at, ev.tz) !== C.offsetMin(at, S.tz);
  const box = $('#ev-tz'), sig = [S.tz, ev.tz, at, differs].join('|');
  if (box.dataset.sig === sig) return; // keep the menu as it is (and open, if it is)
  box.dataset.sig = sig;
  box.innerHTML = `<label class="tzpick"><span>Times shown in</span> <select id="viewtz">${tzOptions(S.tz, ev.tz)}</select></label>
    ${differs ? `<span class="note">The poll was made in ${esc(C.tzLabel(ev.tz, at))}.${nightRows() ? ` ${ICON.moon} marks times that fall overnight for you.` : ''}</span>` : ''}`;
}

function isNight(min) { return min < 7 * 60 || min >= 22 * 60; }
function nightRows() {
  const at = S.lay.keys[0] * 60000;
  if (C.offsetMin(at, S.ev.tz) === C.offsetMin(at, S.tz)) return false;
  return S.lay.rows.some(r => isNight(r.min));
}

function renderTabs() {
  const n = S.ev.responses.length;
  $('#tabcount').textContent = n ? `(${n})` : '';
  $('#panes').dataset.tab = S.tab;
  $('#tab-mine').setAttribute('aria-selected', String(S.tab === 'mine'));
  $('#tab-group').setAttribute('aria-selected', String(S.tab === 'group'));
  $('#tab-mine').tabIndex = S.tab === 'mine' ? 0 : -1;
  $('#tab-group').tabIndex = S.tab === 'group' ? 0 : -1;
}
function setTab(t, focus) {
  S.tab = t; renderTabs();
  if (t === 'group') drawBlocks();
  if (focus) $('#tab-' + t).focus();
  if (matchMedia('(max-width: 979px)').matches) { const tabs = $('#ev-tabs'); if (tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' }); }
}
$('#ev-tabs').addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) setTab(b.id === 'tab-mine' ? 'mine' : 'group'); });
$('#ev-tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); setTab(S.tab === 'mine' ? 'group' : 'mine', true);
});

/* ---------- grids ---------- */

function rowHeight() {
  const step = S.ev.step, big = coarse();
  return step === 15 ? (big ? 22 : 16) : step === 30 ? (big ? 30 : 22) : (big ? 40 : 32);
}

function gridHTML(kind) {
  const { cols, rows, grid } = S.lay, ev = S.ev;
  const night = nightRows();
  let firstKey = null;
  let h = `<div class="grid ${kind}" role="grid" aria-label="${kind === 'mine' ? 'Your availability' : 'Everyone’s availability'}" aria-rowcount="${rows.length + 1}" aria-colcount="${cols.length + 1}">`;
  h += '<div class="g-row g-head" role="row"><div class="g-corner" role="columnheader"><span class="sr-only">Time</span></div>';
  for (const c of cols) {
    const L = C.dayLabel(c, ev.mode, LOC);
    h += `<div class="g-day" role="columnheader" title="${esc(L.long)}"><b>${esc(L.top)}</b>${L.bottom ? `<span>${esc(L.bottom)}</span>` : ''}<span class="sr-only">${esc(L.long)}</span></div>`;
  }
  h += '</div>';
  rows.forEach((r, ri) => {
    const hour = r.min % 60 === 0;
    const showLabel = hour || ri === 0 || r.gap || ev.step === 60;
    h += `<div class="g-row${r.gap ? ' gap' : ''}${hour ? ' hour' : ''}" role="row"><div class="g-time" role="rowheader">${showLabel ? `<span>${esc(C.clock(r.min, true, LOC))}</span>` : `<span class="sr-only">${esc(C.clock(r.min, false, LOC))}</span>`}${night && isNight(r.min) ? ICON.moon : ''}</div>`;
    cols.forEach((c, ci) => {
      const k = grid[ci][ri];
      if (k == null) { h += '<div class="c none" role="gridcell" aria-disabled="true"><span class="sr-only">Not in the poll</span></div>'; return; }
      const tab = firstKey == null ? 0 : -1;
      if (firstKey == null) firstKey = k;
      h += `<div class="c" role="gridcell" data-k="${k}" tabindex="${tab}"></div>`;
    });
    h += '</div>';
  });
  return h + '</div>';
}

// sizes go through the CSSOM, so the page's own markup never needs style="" attributes
function sizeGrid(g) {
  g.style.setProperty('--cols', String(S.lay.cols.length));
  g.style.setProperty('--rh', rowHeight() + 'px');
}

function cellsOf(kind) {
  const m = new Map();
  for (const el of $$(`#${kind === 'mine' ? 'mgrid' : 'ggrid'} .c[data-k]`)) m.set(+el.dataset.k, el);
  return m;
}
let mineCells = new Map(), groupCells = new Map();

function focusCell(kind, k, noScroll) {
  const cells = kind === 'mine' ? mineCells : groupCells;
  const el = cells.get(k);
  if (!el) return;
  const prev = $(`#${kind === 'mine' ? 'mgrid' : 'ggrid'} .c[tabindex="0"]`);
  if (prev && prev !== el) prev.tabIndex = -1;
  el.tabIndex = 0;
  el.focus({ preventScroll: !!noScroll });
}

// arrow keys move through a grid; in my grid, Space marks a time and Shift+arrows keep marking
function bindGridKeys(gridEl, kind) {
  gridEl.addEventListener('keydown', e => {
    const cell = e.target.closest('.c[data-k]');
    if (!cell) return;
    const k = +cell.dataset.k;
    const [ci, ri] = S.lay.pos.get(k);
    const g = S.lay.grid;
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    let target = null;
    if (dirs[e.key]) {
      const [dx, dy] = dirs[e.key];
      let x = ci + dx, y = ri + dy;
      while (x >= 0 && x < g.length && y >= 0 && y < g[0].length && g[x][y] == null) { x += dx; y += dy; }
      if (x >= 0 && x < g.length && y >= 0 && y < g[0].length) target = g[x][y];
    } else if (e.key === 'Home' || e.key === 'End') {
      const col = e.ctrlKey ? g[ci] : g.map(c => c[ri]);
      const list = col.filter(x => x != null);
      target = e.key === 'Home' ? list[0] : list[list.length - 1];
    }
    if (target != null) {
      e.preventDefault();
      focusCell(kind, target);
      if (kind === 'mine' && e.shiftKey && canEdit()) { setVal(target, S.kbTarget == null ? 2 : S.kbTarget); markDirty(); paintGroup(); }
      return;
    }
    if (kind === 'mine' && (e.key === ' ' || e.key === 'Enter') && canEdit()) {
      e.preventDefault();
      S.kbTarget = targetFor(valOf(k));
      setVal(k, S.kbTarget); markDirty(); paintGroup();
    }
    if (kind === 'group' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); S.pinned = true; showDetail(k); }
    if (kind === 'group' && e.key === 'Escape') hideDetail(true);
  });
}

/* ---------- my answers ---------- */

const canEdit = () => !!(S.me && S.mine && !S.ev.final);
const valOf = k => (S.mine.avail.has(k) ? 2 : S.mine.maybe.has(k) ? 1 : 0);
function targetFor(cur) { return S.paint === 'yes' ? (cur === 2 ? 0 : 2) : S.paint === 'maybe' ? (cur === 1 ? 0 : 1) : 0; }
const VAL_TEXT = ['not marked', 'if needed', 'available'];
function setVal(k, v) {
  S.mine.avail.delete(k); S.mine.maybe.delete(k);
  if (v === 2) S.mine.avail.add(k); else if (v === 1) S.mine.maybe.add(k);
  paintMineCell(k);
}
function paintMineCell(k) {
  const el = mineCells.get(k);
  if (!el) return;
  const v = S.mine ? valOf(k) : 0;
  el.className = 'c' + (v === 2 ? ' y' : v === 1 ? ' m' : '') + (S.busy.has(k) ? ' b' : '');
  el.setAttribute('aria-label', slotText(k) + ', ' + VAL_TEXT[v] + (S.busy.has(k) ? ', busy on your calendar' : ''));
}
function paintMine() { for (const k of mineCells.keys()) paintMineCell(k); }

function renderMine(rebuild) {
  const pane = $('#pane-mine'), ev = S.ev;
  const mode = !S.me ? (ev.final ? 'closed' : 'join') : 'edit';
  if (mode !== S.mineMode || rebuild || mode === 'closed') {
    S.mineMode = mode;
    if (mode === 'join') pane.innerHTML = joinHTML();
    else if (mode === 'closed') pane.innerHTML = `<div class="panehead"><h2>Your availability</h2></div><p class="note">The organizer picked a time, so this poll isn’t taking new answers.</p>`;
    else {
      pane.innerHTML = mineHTML();
      $('#mgrid').innerHTML = gridHTML('mine');
      mineCells = cellsOf('mine');
      const g = $('#mgrid .grid');
      sizeGrid(g);
      bindPaint(g);
      bindGridKeys(g, 'mine');
    }
  }
  if (mode === 'edit') {
    $('.who', pane).innerHTML = whoHTML();
    const note = $('#mynote');
    if (note && document.activeElement !== note) note.value = S.mine ? S.mine.note : '';
    if (note) note.disabled = !!ev.final;
    $$('[data-paint]', pane).forEach(b => b.setAttribute('aria-checked', String(b.dataset.paint === S.paint)));
    $('#mgrid').classList.toggle('locked', !!ev.final);
    $('.toolbar', pane).hidden = !!ev.final;
    $('.hint', pane).hidden = !!ev.final;
    $('.calrow', pane).hidden = !!ev.final;
    renderCalState();
    setSave(S.saveState || (S.dirty ? 'pending' : ''));
    paintMine();
  }
}

function joinHTML() {
  const acctName = user ? ((user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || '') : '';
  return `<div class="panehead"><h2>Add your availability</h2></div>
  <form class="joinform" data-form="join" novalidate>
    <label class="field"><span>Your name</span><input name="name" type="text" maxlength="60" autocomplete="name" enterkeyhint="go" required value="${esc(acctName)}" placeholder="Your name"></label>
    ${user ? `<p class="note">Signed in as ${esc(user.email || 'you')}. Your answers are saved to your account, so you can change them from any device.</p>` : `
    <details class="pwopt"><summary>Protect my answers with a password <i>(optional)</i></summary>
      <label class="field"><span>Password</span><input name="pw" type="password" maxlength="72" autocomplete="new-password"></label>
      <p class="note">This only stops other people from changing <em>your</em> answers. Anyone with the poll link can still see the poll and everyone’s answers.</p>
    </details>`}
    <p class="formerr" role="alert" hidden></p>
    <div class="formactions"><button type="submit" class="btn primary">Continue</button>
      ${!user && googleOn ? '<button type="button" class="btn ghost" data-act="signin">Use my Google account</button>' : ''}</div>
    ${user ? '' : '<p class="note">No account needed. This browser remembers your answers so you can come back and change them.</p>'}
  </form>`;
}

function whoHTML() {
  const m = S.me;
  const how = m.account ? 'Saved to your account.' : m.protected ? 'Protected by your password.' : '';
  return `Answering as <b>${esc(m.name)}</b>. ${esc(how)}
    ${m.account ? '' : '<button type="button" class="linkbtn" data-act="switch">Not you?</button>'}
    ${m.token ? '<button type="button" class="linkbtn" data-act="mylink">Edit on another device</button>' : ''}`;
}

function mineHTML() {
  const touch = coarse();
  return `<div class="panehead"><h2>Your availability</h2><span class="savestate" id="savestate" aria-live="polite"></span></div>
  <p class="who"></p>
  <div class="toolbar">
    <div class="paint" role="radiogroup" aria-label="What marking a time does">
      <button type="button" role="radio" data-paint="yes"><span class="sw y" aria-hidden="true"></span>Available</button>
      <button type="button" role="radio" data-paint="maybe"><span class="sw m" aria-hidden="true"></span>If needed</button>
      <button type="button" role="radio" data-paint="no"><span class="sw n" aria-hidden="true"></span>Erase</button>
    </div>
  </div>
  <p class="hint note">${touch ? 'Drag on the grid to mark times, or tap one at a time. Swipe on the times or the day names to scroll.' : 'Click and drag across the times you’re free. Click a marked time again to clear it.'}</p>
  <div class="gridwrap" id="mgrid"></div>
  <div class="minefoot">
    <label class="field"><span>Note <i>(optional)</i></span><input id="mynote" type="text" maxlength="200" placeholder="e.g. Can only do after 4" enterkeyhint="done"></label>
    <div class="calrow">${googleOn ? `<button type="button" class="btn sm gbtn" data-act="gcal-import">${ICON.google}Import Google Calendar</button>` : ''}<button type="button" class="btn sm" data-act="cal">${ICON.cal}${googleOn ? 'Use a calendar file' : 'Check against my calendar'}</button><span class="calstate note" id="calstate" aria-live="polite"></span></div>
    <div class="minelinks"><button type="button" class="linkbtn" data-act="clearmine">Clear all my times</button><button type="button" class="linkbtn danger" data-act="delme">Delete my answers</button></div>
  </div>`;
}

function setSave(state, msg) {
  S.saveState = state;
  const el = $('#savestate');
  if (!el) return;
  el.className = 'savestate ' + state;
  el.innerHTML = state === 'saving' ? 'Saving…' : state === 'saved' ? ICON.check + 'Saved' : state === 'pending' ? 'Unsaved changes' :
    state === 'error' ? `Not saved. <button type="button" class="linkbtn" data-act="retrysave">Try again</button>` : '';
  if (state === 'error' && msg) el.title = msg;
}

// dragging paints a rectangle from where you pressed to where you are, like a spreadsheet selection
let drag = null;
function bindPaint(gridEl) {
  gridEl.addEventListener('pointerdown', e => {
    if (e.button > 0 || !canEdit()) return;
    const cell = e.target.closest('.c[data-k]');
    if (!cell) return;
    e.preventDefault();
    const k = +cell.dataset.k;
    try { gridEl.setPointerCapture(e.pointerId); } catch (x) {}
    const p = S.lay.pos.get(k);
    drag = { pid: e.pointerId, a: p, b: p, target: targetFor(valOf(k)), before: { avail: new Set(S.mine.avail), maybe: new Set(S.mine.maybe) } };
    S.kbTarget = drag.target;
    applyDrag();
    focusCell('mine', k, true);
  });
  gridEl.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest ? el.closest('.c[data-k]') : null;
    if (!cell || !gridEl.contains(cell)) return;
    const p = S.lay.pos.get(+cell.dataset.k);
    if (p[0] !== drag.b[0] || p[1] !== drag.b[1]) { drag.b = p; applyDrag(); }
  });
  const end = e => { if (!drag || e.pointerId !== drag.pid) return; drag = null; markDirty(); paintGroup(); };
  gridEl.addEventListener('pointerup', end);
  gridEl.addEventListener('pointercancel', end);
  gridEl.addEventListener('lostpointercapture', end);
}
function applyDrag() {
  const c0 = Math.min(drag.a[0], drag.b[0]), c1 = Math.max(drag.a[0], drag.b[0]);
  const r0 = Math.min(drag.a[1], drag.b[1]), r1 = Math.max(drag.a[1], drag.b[1]);
  for (const k of S.lay.keys) {
    const [ci, ri] = S.lay.pos.get(k);
    const inside = ci >= c0 && ci <= c1 && ri >= r0 && ri <= r1;
    const v = inside ? drag.target : drag.before.avail.has(k) ? 2 : drag.before.maybe.has(k) ? 1 : 0;
    if (valOf(k) !== v) setVal(k, v);
  }
}

let saveTimer = 0;
function markDirty() {
  S.dirty = true;
  setSave('pending');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 600);
}
async function save() {
  clearTimeout(saveTimer);
  if (!S.me || !S.mine || !S.dirty) return;
  if (S.saving) { S.saveAgain = true; return; }
  S.saving = true; S.dirty = false;
  setSave('saving');
  const id = S.id, me = S.me;
  try {
    const r = await rpc('wyf_save', { p_id: id, p_rid: me.rid, p_token: me.token, p_avail: [...S.mine.avail], p_maybe: [...S.mine.maybe], p_note: S.mine.note || '' });
    if (r.error) {
      S.saving = false;
      const msg = { denied: 'This browser can’t change those answers anymore.', gone: 'Your answers were removed from this poll.', closed: 'The organizer picked a time, so answers are locked.' }[r.error] || r.error;
      toast(msg);
      if (r.error !== 'closed') { S.me = null; S.mine = null; remember(id, { rid: null, token: null }); }
      S.dirty = false; S.saveState = '';
      S.lastSig = ''; load(true);
      return;
    }
    if (S.id === id) setSave(S.dirty ? 'pending' : 'saved');
  } catch (e) {
    S.dirty = true;
    if (S.id === id) setSave('error', e.message);
  }
  S.saving = false;
  if (S.saveAgain || S.dirty) { S.saveAgain = false; if (S.saveState !== 'error') save(); }
}

/* ---------- everyone's answers ---------- */

function renderGroup(rebuild) {
  const pane = $('#pane-group'), ev = S.ev;
  const n = ev.responses.length;
  if (!n) {
    pane.innerHTML = `<div class="panehead"><h2>Everyone’s availability</h2></div>
      <div class="empty"><p><b>No answers yet.</b></p><p class="note">Send the link around. As people add their times, the overlap shows up here, darker where more people are free.</p></div>`;
    groupCells = new Map();
    pane.dataset.built = '';
    return;
  }
  if (rebuild || pane.dataset.built !== S.laySig) {
    pane.innerHTML = `<div class="panehead"><h2>Everyone’s availability</h2><span class="note" id="gcount"></span></div>
      <div id="gbest"></div>
      <div class="legend" id="glegend"></div>
      <div class="gridwrap" id="ggrid">${gridHTML('group')}</div>
      <div class="detail" id="gdetail" hidden></div>
      <div id="gpeople"></div>`;
    pane.dataset.built = S.laySig;
    groupCells = cellsOf('group');
    const g = $('#ggrid .grid');
    sizeGrid(g);
    bindGroup(g);
    bindGridKeys(g, 'group');
    if (blockWatch) { blockWatch.disconnect(); blockWatch.observe(g); }
  }
  paintGroup();
}

function groupPeople() {
  const ps = people();
  return S.only.size ? ps.filter(p => S.only.has(p.id)) : ps;
}

function paintGroup() {
  if (!S.ev || !groupCells.size) return;
  const all = people();
  const ps = groupPeople();
  const n = ps.length;
  const t = C.tally(ps);
  const best = C.bestTimes(S.ev, all, 3);
  S.best = best.length && !S.only.size ? [best[0].start, best[0].end] : null;
  for (const [k, el] of groupCells) {
    const c = t.get(k);
    const yes = c ? c.yes.length : 0, maybe = c ? c.maybe.length : 0;
    const r = n ? (yes + maybe / 2) / n : 0;
    el.style.setProperty('--r', r.toFixed(3));
    el.className = 'c' + (n && yes === n ? ' all' : '') + (maybe ? ' mb' : '') + (S.focusKey === k ? ' cur' : '');
    el.setAttribute('aria-label', `${slotText(k)}: ${yes} of ${n} free${maybe ? `, ${maybe} if needed` : ''}`);
  }
  drawBlocks();
  $('#gcount').textContent = S.only.size ? `Showing ${S.only.size} of ${all.length}` : plural(all.length, 'response');
  $('#glegend').innerHTML = `<span class="ramp" aria-hidden="true"><i></i></span><span>0</span><span class="grow">→</span><span>${n} free</span>
    <span class="lg"><span class="sw mb" aria-hidden="true"></span>someone can if needed</span>
    ${best.length && !S.only.size ? '<span class="lg"><span class="sw best" aria-hidden="true"></span>best time</span>' : ''}`;
  renderBest(best, all);
  renderPeople(all);
  if (S.focusKey != null && !$('#gdetail').hidden) showDetail(S.focusKey);
}

// The best time, and a time picked from the list, each get one outline around the whole run of
// slots (split per column if it crosses midnight), drawn over the grid rather than cell by cell.
function drawBlocks() {
  const g = $('#ggrid .grid');
  if (!g || !S.lay) return;
  let layer = $('.blocks', g);
  if (!layer) { layer = document.createElement('div'); layer.className = 'blocks'; layer.setAttribute('aria-hidden', 'true'); g.appendChild(layer); }
  layer.textContent = '';
  const same = S.best && S.hl && S.best[0] === S.hl[0] && S.best[1] === S.hl[1];
  const runs = [];
  if (S.best) runs.push({ r: S.best, cls: 'best' + (same ? ' on' : ''), label: 'Best time' });
  if (S.hl && !same) runs.push({ r: S.hl, cls: 'on', label: '' });
  for (const run of runs) {
    const byCol = new Map();
    for (const k of slotsBetween(run.r[0], run.r[1])) {
      const p = S.lay.pos.get(k);
      if (!p) continue;
      const c = byCol.get(p[0]) || { top: k, bottom: k };
      if (k < c.top) c.top = k;
      if (k > c.bottom) c.bottom = k;
      byCol.set(p[0], c);
    }
    let first = true;
    for (const c of byCol.values()) {
      const a = groupCells.get(c.top), b = groupCells.get(c.bottom);
      if (!a || !b || !a.offsetWidth) continue;
      const box = document.createElement('div');
      box.className = 'block ' + run.cls;
      box.style.left = a.offsetLeft + 'px';
      box.style.top = a.offsetTop + 'px';
      box.style.width = a.offsetWidth + 'px';
      box.style.height = (b.offsetTop + b.offsetHeight - a.offsetTop) + 'px';
      if (first && run.label) { const t = document.createElement('span'); t.className = 'blocktag'; t.textContent = run.label; box.appendChild(t); }
      first = false;
      layer.appendChild(box);
    }
  }
}
const blockWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => drawBlocks()) : null;

function renderBest(best, all) {
  const box = $('#gbest');
  if (!box) return;
  const ev = S.ev;
  if (!best.length) { box.innerHTML = ''; return; }
  const canPick = ev.admin && !ev.final;
  box.innerHTML = `<h3 class="subh">Best times</h3><ol class="best">${best.map((b, i) => {
    const lab = C.rangeLabel(b.start, b.end, S.tz, ev.mode, LOC);
    const who = `${b.yes.length} of ${all.length} free${b.maybe.length ? `, ${b.maybe.length} if needed` : ''}`;
    const miss = b.no.length ? `Missing ${nameList(b.no)}` : 'Everyone';
    return `<li><button type="button" class="bt${i === 0 ? ' first' : ''}${S.hl && S.hl[0] === b.start && S.hl[1] === b.end ? ' on' : ''}" data-s="${b.start}" data-e="${b.end}" aria-pressed="${!!(S.hl && S.hl[0] === b.start)}">
      <span class="bwhen"><b>${esc(lab.day)}</b><span>${esc(lab.time)}</span>${i === 0 ? '<span class="tag besttag">Best</span>' : ''}</span>
      <span class="bwho">${esc(who)} · ${esc(miss)}${b.missingReq ? ' <span class="tag warn">required person missing</span>' : ''}</span></button>
      ${canPick ? `<button type="button" class="btn sm" data-act="pick" data-s="${b.start}" data-e="${b.end}">Pick</button>` : ''}</li>`;
  }).join('')}</ol>`;
}

function renderPeople(all) {
  const box = $('#gpeople');
  if (!box) return;
  const ev = S.ev, req = new Set(ev.required || []);
  box.innerHTML = `<h3 class="subh">Who answered</h3>
    <p class="note">Tap names to see only those people’s times.${ev.admin ? ' Star anyone the meeting can’t happen without; best times will put them first.' : ''}</p>
    <ul class="people">${all.map(p => `<li class="person${req.has(p.id) ? ' req' : ''}">
      <button type="button" class="pname" data-pid="${esc(p.id)}" aria-pressed="${S.only.has(p.id)}">${esc(p.name)}${S.me && p.id === S.me.rid ? ' <i>(you)</i>' : ''}${req.has(p.id) ? `<span class="reqmark" title="Required">${ICON.star}<span class="sr-only">, required</span></span>` : ''}</button>
      ${p.note ? `<span class="pnote">${esc(p.note)}</span>` : ''}
      ${ev.admin ? `<span class="pacts"><button type="button" class="iconbtn${req.has(p.id) ? ' on' : ''}" data-act="req" data-pid="${esc(p.id)}" aria-pressed="${req.has(p.id)}" aria-label="Required: ${esc(p.name)}" title="Required">${ICON.star}</button>
        <button type="button" class="iconbtn" data-act="remove" data-pid="${esc(p.id)}" aria-label="Remove ${esc(p.name)}’s answers" title="Remove">${ICON.x}</button></span>` : ''}
    </li>`).join('')}</ul>
    ${S.only.size ? '<button type="button" class="btn sm" data-act="everyone">Show everyone</button>' : ''}`;
}

function bindGroup(g) {
  g.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse' || S.pinned) return;
    const c = e.target.closest('.c[data-k]');
    if (c) showDetail(+c.dataset.k);
  });
  g.addEventListener('click', e => {
    const c = e.target.closest('.c[data-k]');
    if (!c) return;
    const k = +c.dataset.k;
    if (S.pinned && S.focusKey === k) { hideDetail(true); return; }
    S.pinned = true;
    focusCell('group', k, true);
    showDetail(k);
  });
  g.addEventListener('focusin', e => { const c = e.target.closest('.c[data-k]'); if (c && S.focusKey !== +c.dataset.k) showDetail(+c.dataset.k); });
}

// the details card stays while the mouse is anywhere in the group pane (including on the card
// itself, which can sit over the bottom of a tall grid), and goes when it leaves
$('#pane-group').addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !S.pinned) hideDetail(); });

function showDetail(k) {
  const box = $('#gdetail');
  if (!box) return;
  const prev = S.focusKey;
  S.focusKey = k;
  if (prev != null && groupCells.get(prev)) groupCells.get(prev).classList.remove('cur');
  if (groupCells.get(k)) groupCells.get(k).classList.add('cur');
  const ps = groupPeople(), ev = S.ev;
  const yes = ps.filter(p => p.avail.includes(k)), maybe = ps.filter(p => !p.avail.includes(k) && p.maybe.includes(k));
  const no = ps.filter(p => !yes.includes(p) && !maybe.includes(p));
  const lab = C.rangeLabel(k, k + ev.step, S.tz, ev.mode, LOC);
  const list = (title, arr, cls) => arr.length ? `<div class="dl ${cls}"><span class="dt">${title}</span><span class="dd">${arr.map(p => esc(p.name)).join(', ')}</span></div>` : '';
  box.innerHTML = `<div class="dhead"><b>${esc(lab.day)}, ${esc(lab.time)}</b><span>${yes.length} of ${ps.length} free</span>
      <button type="button" class="iconbtn" data-act="closedetail" aria-label="Close">${ICON.x}</button></div>
    ${list('Free', yes, 'y')}${list('If needed', maybe, 'm')}${list('Not free', no, 'n')}
    ${ev.admin && !ev.final ? `<button type="button" class="btn sm primary" data-act="pick" data-s="${k}" data-e="${k + Math.max(60, ev.step)}">Pick this time</button>` : ''}`;
  box.hidden = false;
}
function hideDetail(unpin) {
  const box = $('#gdetail');
  if (box) box.hidden = true;
  if (S.focusKey != null && groupCells.get(S.focusKey)) groupCells.get(S.focusKey).classList.remove('cur');
  S.focusKey = null;
  if (unpin) S.pinned = false;
}

/* ---------- actions on a poll ---------- */

$('#view-event').addEventListener('click', async e => {
  const t = e.target.closest('[data-act],[data-paint],[data-pid].pname');
  if (!t) return;
  if (t.dataset.paint) { S.paint = t.dataset.paint; $$('[data-paint]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.paint === S.paint))); return; }
  if (t.classList.contains('pname')) {
    const id = t.dataset.pid;
    if (S.only.has(id)) S.only.delete(id); else S.only.add(id);
    paintGroup(); const again = $(`.pname[data-pid="${CSS.escape(id)}"]`); if (again) again.focus();
    return;
  }
  const act = t.dataset.act, ev = S.ev;
  switch (act) {
    case 'retry': S.lastSig = ''; load(); break;
    case 'home': if (e.button === 0) { e.preventDefault(); go(baseUrl()); } break;
    case 'signin': openAccount(); break;
    case 'share': try { await navigator.share({ title: ev.title, text: `When are you free for “${ev.title}”?`, url: pollUrl(ev.id) }); } catch (x) {} break;
    case 'switch': {
      const how = S.me.protected ? 'your password' : 'your personal link';
      const ok = await confirmDialog('Answer as someone else?', `Your answers as ${S.me.name} stay saved. To change them from this browser later, you’ll need ${how}.`, 'Switch');
      if (!ok) break;
      remember(S.id, { rid: null, token: null, name: null });
      S.me = null; S.mine = null; S.mineMode = ''; S.lastSig = '';
      renderMine(true); paintGroup(); setTab('mine');
      const i = $('#pane-mine input[name=name]'); if (i) { i.value = ''; i.focus(); }
      break;
    }
    case 'mylink': {
      const link = pollUrl(S.id) + '#me=' + S.me.rid + '.' + S.me.token;
      openDialog('Edit on another device', `<p>Open this link on your phone or another computer to change your answers there. Anyone who has it can change your answers, so keep it to yourself.</p>${copyRow(link, 'Your personal link')}
        <div class="dlgactions"><button type="button" class="btn primary" data-done>Done</button></div>`, b => { b.querySelector('[data-done]').onclick = closeDialog; });
      break;
    }
    case 'retrysave': S.dirty = true; save(); break;
    case 'clearmine': {
      if (!canEdit() || (!S.mine.avail.size && !S.mine.maybe.size)) break;
      const before = { avail: new Set(S.mine.avail), maybe: new Set(S.mine.maybe) };
      for (const k of S.lay.keys) if (valOf(k)) setVal(k, 0);
      markDirty(); paintGroup();
      toast('Cleared your times.', { label: 'Undo', run: () => { S.mine.avail = before.avail; S.mine.maybe = before.maybe; paintMine(); markDirty(); paintGroup(); } });
      break;
    }
    case 'delme': {
      const ok = await confirmDialog('Delete your answers?', `This removes ${S.me.name} and all of your times from the poll.`, 'Delete my answers', true);
      if (!ok) break;
      try {
        const r = await rpc('wyf_remove_response', { p_id: S.id, p_rid: S.me.rid, p_admin: null, p_token: S.me.token });
        if (r.error) throw new Error('You can’t remove those answers from this browser.');
        remember(S.id, { rid: null, token: null, name: null });
        S.me = null; S.mine = null; S.dirty = false; S.saveState = ''; S.lastSig = '';
        toast('Your answers are deleted.'); load();
      } catch (x) { toast(x.message); }
      break;
    }
    case 'cal': openCalendar(); break;
    case 'gcal-import': importGoogle(t); break;
    case 'calclear': S.busy = new Set(); store.del('wyf.busy.' + S.id); paintMine(); renderCalState(); break;
    case 'closedetail': hideDetail(true); break;
    case 'everyone': S.only.clear(); paintGroup(); break;
    case 'pick': openFinalize(+t.dataset.s, +t.dataset.e); break;
    case 'finalize': openFinalize(); break;
    case 'reopen': {
      const ok = await confirmDialog('Reopen the poll?', 'The final time is cleared and people can change their answers again.', 'Reopen');
      if (ok) adminUpdate({ final: null }, 'The poll is open again.');
      break;
    }
    case 'ics': {
      const o = calEvent();
      const blob = new Blob([I.makeIcs(o)], { type: 'text/calendar;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (ev.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'event') + '.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      break;
    }
    case 'edit': openEdit(); break;
    case 'duplicate': openDuplicate(); break;
    case 'adminlink': if (S.admin) showAdminLink(S.id, S.admin, false); break;
    case 'delete': {
      const ok = await confirmDialog('Delete this poll?', `“${ev.title}” and everyone’s answers will be gone for good. This can’t be undone.`, 'Delete poll', true);
      if (!ok) break;
      try {
        const r = await rpc('wyf_delete_event', { p_id: S.id, p_admin: S.admin });
        if (r.error) throw new Error('Only the organizer can delete this poll.');
        forgetPoll(S.id); toast('Poll deleted.'); go(baseUrl());
      } catch (x) { toast(x.message); }
      break;
    }
    case 'req': {
      const req = new Set(ev.required || []);
      const id = t.dataset.pid;
      if (req.has(id)) req.delete(id); else req.add(id);
      adminUpdate({ required: [...req] });
      break;
    }
    case 'remove': {
      const id = t.dataset.pid;
      const ok = await confirmDialog('Remove these answers?', `${nameOf(id)} and all of their times will be taken off the poll.`, 'Remove', true);
      if (!ok) break;
      try {
        const r = await rpc('wyf_remove_response', { p_id: S.id, p_rid: id, p_admin: S.admin, p_token: null });
        if (r.error) throw new Error('Only the organizer can remove answers.');
        S.only.delete(id); S.lastSig = ''; load(true);
      } catch (x) { toast(x.message); }
      break;
    }
  }
});

$('#view-event').addEventListener('click', e => {
  const b = e.target.closest('.bt');
  if (!b) return;
  const s = +b.dataset.s, en = +b.dataset.e;
  S.hl = S.hl && S.hl[0] === s && S.hl[1] === en ? null : [s, en];
  paintGroup();
  if (S.hl) {
    const el = groupCells.get(s);
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  const again = $(`.bt[data-s="${s}"]`); if (again) again.focus({ preventScroll: true });
});

$('#view-event').addEventListener('submit', async e => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  const err = $('.formerr', f);
  const btn = f.querySelector('[type=submit]');
  if (f.dataset.form === 'gate') {
    S.pass = f.elements.pw.value;
    remember(S.id, { pass: S.pass });
    btn.disabled = true;
    await load();
    return;
  }
  if (f.dataset.form === 'join') {
    const name = f.elements.name.value.trim();
    const pw = f.elements.pw ? f.elements.pw.value : '';
    const fail = m => { err.innerHTML = m; err.hidden = false; };
    if (!name) { fail('Type your name so people know who’s free.'); f.elements.name.focus(); return; }
    btn.disabled = true;
    try {
      const r = await rpc('wyf_join', { p_id: S.id, p_name: name, p_password: pw || null, p_event_password: S.pass });
      if (r.error) {
        btn.disabled = false;
        const opener = () => { const d = $('.pwopt', f); if (d) { d.open = true; f.elements.pw.focus(); } };
        if (r.error === 'name_taken') fail(`Someone already answered as “${esc(name)}” on another device. If that’s you, open the poll there, or use your personal link from it. Otherwise add something to your name, like “${esc(name)} ${esc((name[0] || 'A').toUpperCase())}.”`);
        else if (r.error === 'name_protected') { fail(`“${esc(name)}” is protected by a password. Enter it below to change those answers, or use a different name.`); opener(); }
        else if (r.error === 'wrong_password') { fail('That password isn’t right for that name.'); opener(); }
        else if (r.error === 'name_account') fail(`“${esc(name)}” answered with a Google account. If that’s you, <button type="button" class="linkbtn" data-act="signin">sign in</button>. Otherwise use a different name.`);
        else if (r.error === 'closed') fail('The organizer already picked a time, so this poll isn’t taking new answers.');
        else if (r.error === 'full') fail('This poll has reached 300 answers, the most it can take.');
        else if (r.error === 'password') { S.lastSig = ''; load(); }
        else fail(esc(r.error));
        return;
      }
      S.me = { rid: r.rid, token: r.token || null, name: r.name };
      remember(S.id, { rid: r.rid, token: r.token || null, name: r.name });
      S.mine = null; S.mineMode = ''; S.lastSig = '';
      await load();
      const first = $('#mgrid .c[tabindex="0"]');
      if (first && !coarse()) first.focus({ preventScroll: true });
      if (coarse()) { const tb = $('#pane-mine .toolbar'); if (tb) tb.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    } catch (x) { btn.disabled = false; fail(esc(x.message)); }
  }
});

$('#view-event').addEventListener('input', e => {
  if (e.target.id === 'mynote' && canEdit()) { S.mine.note = e.target.value; markDirty(); }
});
$('#view-event').addEventListener('change', e => {
  if (e.target.id === 'viewtz') {
    S.tz = e.target.value;
    S.laySig = ''; S.lastSig = ''; S.hl = null; hideDetail(true);
    applyEvent(S.ev);
  }
});

async function adminUpdate(patch, msg) {
  try {
    const r = await rpc('wyf_update_event', { p_id: S.id, p_admin: S.admin, p: patch });
    if (r.error) throw new Error(r.error === 'denied' ? 'Only the organizer can change this poll.' : 'That poll is gone.');
    S.lastSig = '';
    applyEvent(r);
    if (msg) toast(msg);
    return true;
  } catch (x) { toast(x.message); return false; }
}

function openEdit() {
  const ev = S.ev;
  openDialog('Edit poll', '<div id="editbox"></div>', b => {
    pollForm($('#editbox', b), ev, {
      submit: 'Save changes', cancel: true, onCancel: closeDialog,
      onSubmit: async v => {
        const patch = { title: v.title, details: v.details, mode: v.mode, days: v.days, start: v.start, end: v.end, step: v.step, tz: v.tz, hours: v.hours };
        if (v.nopass) patch.password = null; else if (v.password) patch.password = v.password;
        const r = await rpc('wyf_update_event', { p_id: S.id, p_admin: S.admin, p: patch });
        if (r.error) throw new Error('Only the organizer can change this poll.');
        if (patch.password !== undefined) { S.pass = patch.password; remember(S.id, { pass: patch.password }); }
        closeDialog();
        S.lastSig = ''; S.laySig = '';
        applyEvent(r);
        toast('Poll updated. Answers for times you kept are still there.');
      }
    });
  }, { wide: true });
}

function openDuplicate() {
  const ev = S.ev;
  openDialog('Duplicate this poll', `<p>Makes a fresh poll with the same days, times and description. Answers and the password aren’t copied.</p>
    <form data-form="dup" class="stack">
      <label class="field"><span>Name</span><input name="title" type="text" maxlength="120" required value="${esc(ev.title)}"></label>
      ${ev.mode === 'dates' ? '<label class="check"><input type="checkbox" name="shift" checked> Move every date one week later</label>' : ''}
      <p class="formerr" role="alert" hidden></p>
      <div class="dlgactions"><button type="submit" class="btn primary">Make the copy</button><button type="button" class="btn ghost" data-no>Cancel</button></div>
    </form>`, b => {
    const f = $('form', b);
    $('[data-no]', b).onclick = closeDialog;
    f.onsubmit = async e => {
      e.preventDefault();
      const title = f.elements.title.value.trim();
      if (!title) return;
      const days = ev.mode === 'dates' && f.elements.shift && f.elements.shift.checked ? ev.days.map(d => C.addDays(d, 7)) : ev.mode === 'week' ? C.weekDates(ev.days.map(C.weekdayOf), C.todayIn(ev.tz)) : ev.days;
      const hours = {}, from = [...ev.days].sort(), to = [...days].sort(); // the same days keep their own times
      from.forEach((d, i) => { const h = ev.hours && ev.hours[d]; if (h && to[i]) hours[to[i]] = h; });
      try {
        const res = await rpc('wyf_create_event', { p: { title, details: ev.details, mode: ev.mode, days, start: ev.start, end: ev.end, step: ev.step, tz: ev.tz, hours } });
        remember(res.id, { title, admin: res.admin, organizer: true, mode: ev.mode, days, tz: ev.tz, created: Date.now(), seenIds: [] });
        closeDialog();
        go(pollUrl(res.id));
        showAdminLink(res.id, res.admin, true);
      } catch (x) { const er = $('.formerr', f); er.textContent = x.message; er.hidden = false; }
    };
  });
}

function openFinalize(s0, e0) {
  const ev = S.ev, lay = S.lay;
  const all = people();
  if (s0 == null) {
    const b = C.bestTimes(ev, all, 1)[0];
    s0 = b ? b.start : lay.keys[0];
    e0 = b ? b.end : s0 + Math.max(60, ev.step);
  }
  const colOf = k => lay.pos.get(k)[0];
  let ci = colOf(s0);
  const dayKeys = c => lay.grid[c].filter(k => k != null);
  const optTime = (k, sel) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(C.clock(C.partsIn(k * 60000, S.tz).min, false, LOC))}</option>`;
  openDialog('Pick the final time', `<form class="stack finalform">
      <label class="field"><span>Day</span><select name="day">${lay.cols.map((c, i) => `<option value="${i}"${i === ci ? ' selected' : ''}>${esc(C.dayLabel(c, ev.mode, LOC).long)}</option>`).join('')}</select></label>
      <div class="timerow"><label class="field"><span>Starts</span><select name="start"></select></label><label class="field"><span>Ends</span><select name="end"></select></label></div>
      <p class="note fsum" aria-live="polite"></p>
      <p class="note">Everyone sees this in their own time zone and can add it to their calendar. Answers lock until you reopen the poll.</p>
      <div class="dlgactions"><button type="submit" class="btn primary">Set the final time</button><button type="button" class="btn ghost" data-no>Cancel</button></div>
    </form>`, b => {
    const f = $('form', b), F = f.elements;
    const fill = (s, e) => {
      const keys = dayKeys(+F.day.value);
      if (!keys.includes(s)) s = keys[0];
      F.start.innerHTML = keys.map(k => optTime(k, s)).join('');
      const ends = keys.filter(k => k >= s).map(k => k + ev.step); // the end of each slot from the start onward
      const e2 = ends.includes(e) ? e : ends.find(k => k - s >= 60) || ends[ends.length - 1];
      F.end.innerHTML = ends.map(k => optTime(k, e2)).join('');
      summary();
    };
    const summary = () => {
      const s = +F.start.value, e = +F.end.value;
      const ks = slotsBetween(s, e);
      const ok = all.filter(p => ks.every(k => p.avail.includes(k) || p.maybe.includes(k)));
      const miss = all.filter(p => !ok.includes(p)).map(p => p.id);
      $('.fsum', f).textContent = `${ok.length} of ${all.length} can make all of it.${miss.length ? ' Not free for all of it: ' + nameList(miss) + '.' : ''}`;
    };
    fill(s0, e0);
    F.day.onchange = () => fill(-1, -1);
    F.start.onchange = () => fill(+F.start.value, +F.end.value);
    F.end.onchange = summary;
    $('[data-no]', b).onclick = closeDialog;
    f.onsubmit = async e => {
      e.preventDefault();
      const ok = await adminUpdate({ final: [+F.start.value, +F.end.value] });
      if (ok) { closeDialog(); toast('Final time set. Everyone with the link can see it and add it to their calendar.'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    };
  });
}

/* ---------- comparing against your own calendar (stays on this device) ---------- */

function renderCalState() {
  const el = $('#calstate');
  if (!el) return;
  const n = [...S.busy].filter(k => S.keySet.has(k)).length;
  el.innerHTML = S.busy.size ? `${plural(n, 'busy time')} from your calendar shown as stripes. <button type="button" class="linkbtn" data-act="calclear">Hide</button>` : '';
}

// shows what came back from a calendar (Google or .ics files), with an offer to fill in the rest
function busyResult(out, n, extra) {
  out.innerHTML = esc(extra || '') +
    (n ? `Found ${plural(n, 'busy time')} during this poll. They’re striped on your grid.` : 'Your calendar is clear for every time in this poll.') +
    (canEdit() ? ` <button type="button" class="btn sm" data-fill>Mark my other times as available</button>` : '');
  const fill = $('[data-fill]', out);
  if (fill) fill.onclick = () => {
    let c = 0;
    for (const k of S.lay.keys) if (!S.busy.has(k) && valOf(k) === 0) { setVal(k, 2); c++; }
    if (c) { markDirty(); paintGroup(); }
    fill.replaceWith(document.createTextNode(c ? ` Marked ${plural(c, 'time')} as available. Check them over before you go.` : ' Nothing left to mark.'));
  };
}
function useBusy(busy) {
  busy.sort((a, c) => a[0] - c[0]);
  S.busy = I.busySlots(S.lay.keys, S.ev.step, busy);
  store.set('wyf.busy.' + S.id, [...S.busy]);
  paintMine(); renderCalState();
  return S.busy.size;
}

/* Google Calendar: asks Google for read-only access to free/busy times (never event names or details)
   with a short-lived token that stays in this page's memory. The calendar is read straight from
   Google in this browser; nothing about it is sent to this site's server. */
const GCAL_SCOPES = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.freebusy';
let gcalToken = null; // { token, until }
function googleToken() {
  if (gcalToken && gcalToken.until > Date.now() + 60000) return Promise.resolve(gcalToken.token);
  return loadGsi().then(() => new Promise((res, rej) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: GCAL_SCOPES, include_granted_scopes: false,
      login_hint: (user && user.email) || undefined,
      callback: r => {
        if (r.error) return rej(new Error('Google didn’t give access to your calendar.'));
        if (!google.accounts.oauth2.hasGrantedAnyScope(r, 'https://www.googleapis.com/auth/calendar.freebusy')) return rej(new Error('To import your calendar, allow access to when you’re busy.'));
        gcalToken = { token: r.access_token, until: Date.now() + (+r.expires_in || 3000) * 1000 };
        res(r.access_token);
      },
      error_callback: e => rej(new Error(e && e.type === 'popup_closed' ? 'The Google window was closed before it finished.' : e && e.type === 'popup_failed_to_open' ? 'Your browser blocked the Google window. Allow pop-ups for this site and try again.' : 'Google sign-in didn’t finish.'))
    });
    client.requestAccessToken();
  }));
}
async function googleBusy(from, to) {
  const token = await googleToken();
  const auth = { Authorization: 'Bearer ' + token };
  const api = 'https://www.googleapis.com/calendar/v3/';
  let ids = ['primary'];
  try {
    const r = await fetch(api + 'users/me/calendarList?minAccessRole=freeBusyReader&maxResults=100', { headers: auth });
    if (r.ok) {
      const j = await r.json();
      // calendars that are turned on, minus holidays and birthdays, which aren't "busy"
      const on = (j.items || []).filter(c => c.selected !== false && !c.hidden && !/#(holiday|contacts)@group\.v\.calendar\.google\.com$/.test(c.id)).map(c => c.id);
      if (on.length) ids = on.slice(0, 50);
    }
  } catch (e) { /* fall back to the main calendar */ }
  const busy = [];
  const SPAN = 60 * 86400000; // Google answers about up to two months at a time
  for (let a = from; a < to; a += SPAN) {
    const r = await fetch(api + 'freeBusy', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({ timeMin: new Date(a).toISOString(), timeMax: new Date(Math.min(to, a + SPAN)).toISOString(), items: ids.map(id => ({ id })) }) });
    if (r.status === 401) { gcalToken = null; throw new Error('Google access ran out. Try again.'); }
    if (!r.ok) throw new Error(r.status === 403 ? 'Google Calendar import isn’t switched on for this site yet.' : 'Couldn’t read your Google Calendar. Try again.');
    const j = await r.json();
    for (const c of Object.values(j.calendars || {})) for (const b of c.busy || []) busy.push([Date.parse(b.start), Date.parse(b.end)]);
  }
  return busy;
}
async function importGoogle(btn, out) {
  const state = out || $('#calstate');
  if (btn) btn.disabled = true;
  if (state) state.textContent = 'Opening Google…';
  try {
    const keys = S.lay.keys;
    const busy = await googleBusy(keys[0] * 60000, (keys[keys.length - 1] + S.ev.step) * 60000);
    const n = useBusy(busy);
    if (out) busyResult(out, n, 'Imported from Google Calendar. ');
    else toast(n ? `Imported your Google Calendar: ${plural(n, 'busy time')} striped on your grid.` : 'Imported your Google Calendar: you’re free for every time in this poll.');
  } catch (e) {
    if (state) state.textContent = e.message;
    else toast(e.message);
  }
  if (btn) btn.disabled = false;
}

function openCalendar() {
  openDialog('Check against your calendar', `
    ${googleOn ? `<div class="gimport">
      <button type="button" class="btn primary gbtn" data-gcal>${ICON.google}Import from Google Calendar</button>
      <p class="note">Google asks you to allow read-only access to when you’re busy. Only busy and free times are read, never what your events are, and they go straight from Google to this browser. Nothing is saved on our server.</p>
    </div>
    <p class="ordiv"><span>or use a calendar file</span></p>` : ''}
    <p>Choose one or more <b>.ics</b> files exported from your calendar. They’re read right here on this device. Nothing is uploaded, and nobody else sees your calendar: busy times just show as stripes on your own grid.</p>
    <label class="filepick btn">${ICON.cal}Choose .ics files<input type="file" accept=".ics,text/calendar" multiple hidden></label>
    <p class="calresult" aria-live="polite"></p>
    <details><summary>How do I get an .ics file?</summary>
      <ul class="tips">
        <li><b>Google Calendar</b> (on a computer): Settings → Import &amp; export → Export. You get a .zip file; open it and choose the .ics files inside.</li>
        <li><b>Outlook</b>: in the Windows app, File → Save Calendar. On outlook.com, Settings → Calendar → Shared calendars → Publish a calendar, then open the ICS link to download it.</li>
        <li><b>Apple Calendar</b> (Mac): choose a calendar, then File → Export → Export.</li>
      </ul>
    </details>
    <div class="dlgactions"><button type="button" class="btn primary" data-done>Done</button></div>`, b => {
    const input = $('input[type=file]', b), out = $('.calresult', b);
    $('[data-done]', b).onclick = closeDialog;
    const g = $('[data-gcal]', b);
    if (g) g.onclick = () => importGoogle(g, out);
    input.onchange = async () => {
      const files = [...input.files];
      if (!files.length) return;
      out.textContent = 'Reading…';
      const keys = S.lay.keys, step = S.ev.step;
      const from = keys[0] * 60000, to = (keys[keys.length - 1] + step) * 60000;
      const busy = [];
      let bad = 0;
      for (const f of files) {
        try {
          const text = await f.text();
          if (!/BEGIN:VCALENDAR/i.test(text)) { bad++; continue; }
          busy.push(...I.busyFromIcs(text, from, to, HOME_TZ));
        } catch (x) { bad++; }
      }
      const n = useBusy(busy);
      busyResult(out, n, bad ? `${plural(bad, 'file')} couldn’t be read as a calendar. ` : '');
    };
  });
}
/* ---------- accounts (optional, shared with Signature Studio) ---------- */

function renderAccount() {
  const b = $('#acctbtn');
  if (!sb) { b.hidden = true; return; }
  b.hidden = false;
  b.textContent = user ? (user.email || 'Account') : 'Sign in';
  b.title = user ? 'Your account' : 'Sign in to keep your polls on every device';
}
$('#acctbtn').addEventListener('click', openAccount);

function claimables() {
  const all = Object.values(known());
  return {
    admin: all.filter(k => k.admin).map(k => ({ id: k.id, token: k.admin })),
    responses: all.filter(k => k.rid && k.token).map(k => ({ id: k.id, rid: k.rid, token: k.token }))
  };
}
function renderClaimBanner() {
  const box = $('#claimbanner');
  if (!box) return;
  const c = claimables();
  const n = new Set([...c.admin, ...c.responses].map(x => x.id)).size;
  const done = user && store.get('wyf.claimed.' + user.id, false);
  box.innerHTML = user && n && !done ? `<div class="banner"><p>${plural(n, 'poll')} on this browser ${n === 1 ? 'isn’t' : 'aren’t'} in your account yet.</p><button type="button" class="btn sm primary" data-claim>Add to my account</button></div>` : '';
  const b = $('[data-claim]', box);
  if (b) b.onclick = claimLocal;
}
async function claimLocal() {
  if (!user) return;
  try {
    const r = await rpc('wyf_claim', { p: claimables() });
    store.set('wyf.claimed.' + user.id, true);
    toast(r.claimed ? `Added ${plural(r.claimed, 'poll')} to your account.` : 'Those polls are already linked to an account.');
    renderClaimBanner();
    if (S.view === 'event') { S.lastSig = ''; load(true); } else renderMyPolls();
  } catch (x) { toast(x.message); }
}

async function setUser(u) {
  const was = user && user.id;
  user = u || null;
  renderAccount();
  if ((user && user.id) === was) return;
  if (user && dlg.open && $('#gsibtn')) { closeDialog(); toast('Signed in as ' + (user.email || 'you') + '.'); }
  if (!user && S.me && !S.me.token) { S.me = null; S.mine = null; }
  if (user) {
    const c = claimables();
    const n = new Set([...c.admin, ...c.responses].map(x => x.id)).size;
    if (n && !store.get('wyf.claimed.' + user.id, false)) toast(`Add the ${plural(n, 'poll')} on this browser to your account?`, { label: 'Add them', run: claimLocal });
  }
  if (S.view === 'event' && S.id) { S.lastSig = ''; S.mineMode = ''; load(true); }
  else if (S.view === 'home') renderMyPolls();
}

let authStep = 'signin', delAcct = false;
function openAccount() {
  if (!sb) return;
  delAcct = false;
  openDialog(user ? 'Your account' : 'Sign in', '<div id="acctbody"></div>', drawAccount);
}
function drawAccount() {
  const B = $('#acctbody');
  if (!B) return;
  if (user) {
    B.innerHTML = `<p>Signed in as <b>${esc(user.email || '')}</b>. Polls you make or answer while signed in are saved to your account, so you can get back to them on any device. It’s the same account as Signature Studio.</p>
      <div class="dlgactions start"><button class="btn" type="button" data-a="signout">Sign out</button></div>
      <div class="dangerzone"><h3>Delete account</h3><p class="note">Deletes your account and everything in it on jackjaillet.com, for good: polls you organize (with everyone’s answers), your own answers, and any Signature Studio signatures and companies.</p>
      ${delAcct ? '<label class="field"><span>Type DELETE to confirm</span><input id="delconfirm" type="text" autocomplete="off"></label><div class="dlgactions start"><button class="btn danger solid" type="button" data-a="delgo">Delete my account</button><button class="btn ghost" type="button" data-a="delno">Cancel</button></div>' : '<div class="dlgactions start"><button class="btn ghost danger" type="button" data-a="del">Delete account…</button></div>'}</div>`;
  } else {
    B.innerHTML = `<p>Sign in to keep the polls you make and answer on every device. It’s optional: without an account, this browser remembers them.</p>
      ${googleOn ? '<div id="gsibtn" class="gsiwrap"><span class="note">Loading Google sign-in…</span></div>' : '<p class="note">Sign-in isn’t available right now. Everything still works without it.</p>'}
      <p class="note">Same account as Signature Studio. Google shares your name and email address with this site, nothing else.</p>`;
    mountGoogle();
  }
  B.onclick = async e => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'signout') { await save(); await sb.auth.signOut(); closeDialog(); toast('Signed out. Your polls stay in your account.'); }
    if (a.dataset.a === 'del') { delAcct = true; drawAccount(); $('#delconfirm').focus(); }
    if (a.dataset.a === 'delno') { delAcct = false; drawAccount(); }
    if (a.dataset.a === 'delgo') {
      if ($('#delconfirm').value.trim() !== 'DELETE') { $('#delconfirm').focus(); return; }
      const { error } = await sb.rpc('delete_my_account');
      if (error) { toast('Could not delete the account: ' + error.message); return; }
      await sb.auth.signOut(); closeDialog(); toast('Your account and everything in it is deleted.');
    }
  };
}
let gsiLoading = null;
function loadGsi() {
  return gsiLoading || (gsiLoading = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
    sc.onload = res; sc.onerror = () => { gsiLoading = null; rej(new Error("Google sign-in couldn't load")); };
    document.head.appendChild(sc);
  }));
}
const hexOf = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
async function mountGoogle() {
  const box = $('#gsibtn');
  if (!box) return;
  try {
    await loadGsi();
    const raw = hexOf(crypto.getRandomValues(new Uint8Array(16)));
    const hashed = hexOf(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID, nonce: hashed, ux_mode: 'popup', context: 'signin', itp_support: true,
      callback: async resp => {
        const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token: resp.credential, nonce: raw });
        if (error) toast("Google sign-in didn't finish: " + error.message);
      }
    });
    if (!document.body.contains(box)) return;
    box.innerHTML = '';
    const dark = document.documentElement.dataset.theme !== 'light';
    google.accounts.id.renderButton(box, { type: 'standard', theme: dark ? 'filled_black' : 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'center', width: Math.min(360, Math.max(220, box.clientWidth || 320)) });
  } catch (e) { box.innerHTML = `<p class="note">${esc(e.message)}. Everything still works without signing in.</p>`; }
}

/* ---------- about ---------- */

$('#aboutbtn').addEventListener('click', () => {
  openDialog('About WhenUFree', `
    <p>WhenUFree is a free group scheduling poll made by <a href="/">Jack Jaillet</a>. Make a poll, send the link, and everyone marks when they’re free. It works on any phone, shows each person their own time zone, and never needs an account.</p>
    <h3>What’s stored</h3>
    <ul class="tips">
      <li>For each poll: its name, description, days and times, and the final time if one is picked.</li>
      <li>For each answer: the name you type, your note, and the times you marked.</li>
      <li>Passwords are stored only as scrambled hashes. The organizer link and personal links work the same way: the server can check them but can’t read them back.</li>
      <li>If you sign in with Google, your polls and answers are tied to your account (your email address and name).</li>
    </ul>
    <h3>What isn’t</h3>
    <ul class="tips">
      <li>Your calendar. If you check against an .ics file, it’s read on your device and never sent anywhere. If you import your Google Calendar, Google sends only your busy and free times, straight to your browser, and they’re never saved on our server.</li>

      <li>No ads, and nothing is sold or shared.</li>
    </ul>
    <h3>How long it’s kept</h3>
    <p>Polls are deleted automatically 90 days after their last activity (and never before 30 days after their last date). Organizers can delete a poll any time, and anyone can delete their own answers.</p>
    <h3>Who can see what</h3>
    <p>Anyone with a poll’s link can see the poll and everyone’s names, notes and times, unless the organizer added a poll password. A personal password only stops others from changing <em>your</em> answers.</p>
    <p class="note">Questions? <a href="mailto:contact@jackjaillet.com">contact@jackjaillet.com</a>. Full details in the <a href="/privacy#when-you-free">privacy policy</a>.</p>
    <div class="dlgactions"><button type="button" class="btn primary" data-done>Got it</button></div>`, b => { b.querySelector('[data-done]').onclick = closeDialog; });
});

/* ---------- start ---------- */

function start() {
  if (window.supabase) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    // the first route waits (briefly) for a saved sign-in, so organizers see their tools straight away
    authReady = Promise.race([sb.auth.getSession().then(r => { user = r.data && r.data.session ? r.data.session.user : null; }).catch(() => {}), new Promise(r => setTimeout(r, 2500))]);
    sb.auth.onAuthStateChange((evt, session) => { setTimeout(() => setUser(session ? session.user : null), 0); });
    fetch(SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: SUPABASE_KEY } }).then(r => r.json())
      .then(j => {
        googleOn = !!(j.external && j.external.google);
        renderAccount();
        const nm = $('#pane-mine input[name=name]'); // add the Google button to the join form, unless someone is already typing in it
        if (googleOn && S.mineMode === 'join' && nm && !nm.value && document.activeElement !== nm) { S.mineMode = ''; renderMine(); }
        if (googleOn && S.mineMode === 'edit' && S.ev) renderMine(true);
      })
      .catch(() => {});
  }
  renderAccount();
  route();
}
start();
})();
