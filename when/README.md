# WhenUFree

A free group scheduling poll. Live at **[jackjaillet.com/when](https://jackjaillet.com/when/)**.

Make a poll, send the link, and everyone drags across the times they're free. The grid shades darker where more people overlap, and the best times rise to the top, outlined as one block on the grid. It keeps the no-signup, two-minute simplicity of a When2meet-style poll and fixes what people leave those tools for:

- **Works on phones.** Dragging on the grid paints times without scrolling the page; tap one cell at a time if you prefer. Swipe on the times or day names to scroll.
- **Everyone sees their own time zone.** Slots are stored as moments in time, so a poll made in Chicago shows 7–9 PM to someone in New York, and overnight times are marked.
- **Three answers, not two.** Available, if needed, or not.
- **Best times.** The top three blocks, who's missing from each, and required people (starred by the organizer) ranked first.
- **Closes the loop.** The organizer picks the final time; everyone sees it and can add it to Google Calendar, Outlook or Apple Calendar (.ics). Weekly polls become a weekly repeating event.
- **Organizer tools.** Edit the title, description, days and times after the fact (answers for times you keep stay put), duplicate a poll (optionally a week later), remove answers, delete the poll.
- **Real edit protection.** Your answers are tied to your browser. To edit from another device, use your personal link, an optional password, or Google sign-in.
- **Check against your calendar.** Import your Google Calendar (read-only free/busy access, read straight into the browser) or load an .ics export, and your busy times show as stripes on your own grid. Nothing about your calendar is uploaded to this site.
- **Days with their own times.** Set one window for every day, then give any day its own start and end.
- **Easy month picking.** Tap the month and year above the calendar to jump to any month.
- **Optional poll password** so strangers with the link can't open the poll.
- **Your polls.** The home page lists the polls this browser made or answered, with new-answer counts, or every poll in your account when signed in.

## Privacy

No account needed. A poll stores what people type into it: its name, description, days and times, and each answer's name, note and times. Passwords, organizer links and personal links are stored only as SHA-256 or bcrypt hashes. Secrets in links ride after the `#`, which browsers never send to a server, and the page wipes them from the address bar once saved. Polls are deleted 90 days after their last activity (never before 30 days after their last date).

Signing in uses the same Google account system as [Signature Studio](../signatures/), so one account covers both tools, and Signature Studio's **Delete account** removes polls and answers too.

## Run it locally

Plain HTML, CSS and JavaScript, no build step. Serve the site root with any static server and open `/when/`:

```
python -m http.server 8000
```

Then open http://localhost:8000/when/. It talks to the live Supabase project (see below), so polls you make locally are real polls.

Tests for the time zone, layout, best-time and calendar code run under Node:

```
node --test when/test/*.test.js
```

## Files

| Path | What it is |
|---|---|
| `index.html` | The page (home and poll views) |
| `js/app.js` | The app: making polls, answering, the grids, organizer tools, sign-in |
| `js/core.js` | Time zones, slots, grid layout, labels and best-time ranking (no DOM) |
| `js/ics.js` | Reading .ics files into busy times; writing the final time as .ics and calendar links |
| `css/app.css` | Styles |
| `supabase/schema.sql` | Tables and the `wyf_*` database functions |
| `supabase/2026-11-26-day-hours.sql` | Migration for an existing project: adds per-day times |
| `assets/logo.svg` | The WUF logo (also the favicon) |
| `vendor/supabase.js` | supabase-js 2.45.4 (MIT), for the database and optional sign-in |
| `fonts/` | Instrument Sans and Playfair Display (SIL OFL 1.1) |
| `test/` | Node tests for `core.js` and `ics.js` |

## Backend

The page talks to the same Supabase project as Signature Studio. Its public URL and publishable key are at the top of `js/app.js`; they're meant to be public. The tables `wyf_events` and `wyf_responses` are closed to the API, and every read and write goes through security-definer functions that check the poll's admin token, a response's edit token, or the signed-in account: `wyf_create_event`, `wyf_get_event`, `wyf_join`, `wyf_save`, `wyf_update_event`, `wyf_remove_response`, `wyf_delete_event`, `wyf_poll_status`, and for signed-in people `wyf_my_polls` and `wyf_claim`. Expired polls are cleared whenever a new one is made.

Slots are stored as epoch minutes (minutes since 1970 UTC). Days with their own window are kept in `day_hours` as `{"YYYY-MM-DD": [start, end]}`. "Days of the week" polls use the dates of one reference week, which stays fixed when the poll is edited so saved answers keep lining up.

The page's security headers are in the site's `_headers` file under `/when/*`.

### Google Calendar import

Uses Google Identity Services' token client in the browser with the scopes `calendar.calendarlist.readonly` and `calendar.freebusy`, then calls the Calendar API's `freeBusy` endpoint directly from the page. For it to work, the Google Cloud project behind `GOOGLE_CLIENT_ID` needs the Google Calendar API enabled and those two scopes added to its OAuth consent screen (both are "sensitive" scopes, so Google shows an unverified-app warning until the app is verified).

## License

MIT for WhenUFree's own code, see [LICENSE](LICENSE). The fonts are SIL OFL 1.1, see `fonts/OFL.txt`.
