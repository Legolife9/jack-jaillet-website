# Signature Studio

A free, open-source email signature builder for people and teams. Live at **[jackjaillet.com/signatures](https://jackjaillet.com/signatures/)**.

- Design a signature from 19 templates: rows and columns, photos, logos, icons, buttons, borders, brand colors.
- Make it a team signature: use fields like `{{name}}` and `{{title}}`, then paste your staff list from a spreadsheet.
- Copy it into Gmail, Outlook, or Apple Mail, or download the HTML.
- Keep work grouped by company, each with its own brand kit (logo, colors, font).
- Give each person on a team a private link to their own signature, with copy buttons and setup steps (and, if you allow it, a form to update their own details). No account needed for them.
- Share a company with other people by email, choosing what each can do: see employees, edit employees, edit the design, edit the brand kit.

## Privacy

Accounts are optional. Without one, everything stays in your browser (`localStorage`) and nothing you type is sent anywhere; use **Export backup** to keep a copy. If you sign in (with Google, no password), your signatures and companies are saved to your account in [Supabase](https://supabase.com) so they follow you across devices. Row-level security means each account can only read and change its own rows, and **Account > Delete account** removes the account and everything in it. There are no uploads: images are used by link. Google Analytics loads only if a visitor accepts the site's cookie banner (`/js/footer.js`), and query strings are stripped first so personal links never reach it. See the [privacy policy](https://jackjaillet.com/privacy) and [terms](https://jackjaillet.com/terms).

When someone opens an email with your signature, their mail app loads:

- icons from [Iconify](https://iconify.design), converted to PNG by [images.weserv.nl](https://images.weserv.nl), because Gmail doesn't show SVG
- cropped photos through images.weserv.nl
- every other image from the link you gave it

## Run it locally

It's plain HTML, CSS, and JavaScript with no build step. Serve the folder with any static server, for example:

```
python -m http.server 8000
```

Then open http://localhost:8000/. (Opening `index.html` straight from disk mostly works too, but browsers keep a separate saved library for `file://` pages.)

## Files

| Path | What it is |
|---|---|
| `index.html` | The page |
| `js/app.js` | The whole app: templates, editor, email renderer, library |
| `css/app.css` | Styles |
| `vendor/fontawesome/` | Font Awesome Free 6.5.2 icon data |
| `vendor/supabase.js` | supabase-js 2.45.4 (MIT), for optional accounts |
| `fonts/` | IBM Plex Sans and Mono |

The email output is built from nested tables with inline styles. That's what Gmail and Outlook render reliably, so keep new blocks to that pattern.

## Accounts backend

The page talks to one Supabase project. Its public URL and publishable key are in `js/app.js`; they are meant to be public, and the database rules do the protecting. The schema is `signatures` and `companies` (keyed by `(user_id, id)`, owner-only row-level security), `company_members` for sharing, and a few security-definer functions: `shared_companies`/`shared_signatures` (which strip employee data for people without that permission), `save_shared_signature`, `save_shared_team`, `save_shared_company`, `leave_shared_company` and `delete_my_account`. Permissions are enforced in those functions, not just in the page. To run your own copy, create a Supabase project, apply the same schema, and change the two constants.

## Contributing

Issues and pull requests are welcome. Before a change to the email output, test the copied signature in Gmail on the web, Outlook for Windows, and Apple Mail, including dark mode.

## License

MIT for Signature Studio's own code, see [LICENSE](LICENSE). Font Awesome Free icons are CC BY 4.0 and IBM Plex fonts are SIL OFL 1.1, each with its license file in its folder.

Please only make signatures for yourself or for organizations you're allowed to represent.
