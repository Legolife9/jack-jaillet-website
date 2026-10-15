# Signature Studio

A free, open-source email signature builder for people and teams. Live at **[jackjaillet.com/signatures](https://jackjaillet.com/signatures/)**.

- Design a signature from 19 templates: rows and columns, photos, logos, icons, buttons, borders, brand colors.
- Make it a team signature: use fields like `{{name}}` and `{{title}}`, then paste your staff list from a spreadsheet.
- Copy it into Gmail, Outlook, or Apple Mail, or download the HTML.
- Keep work grouped by company, each with its own brand kit (logo, colors, font).

## Privacy

Everything stays in your browser (`localStorage`). There are no accounts, no server, no analytics, and no uploads: images are used by link. Use **Export backup** to save a copy or move to another computer. Clearing your browser data deletes your signatures.

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
| `fonts/` | IBM Plex Sans and Mono |

The email output is built from nested tables with inline styles. That's what Gmail and Outlook render reliably, so keep new blocks to that pattern.

## Contributing

Issues and pull requests are welcome. Before a change to the email output, test the copied signature in Gmail on the web, Outlook for Windows, and Apple Mail, including dark mode.

## License

MIT for Signature Studio's own code, see [LICENSE](LICENSE). Font Awesome Free icons are CC BY 4.0 and IBM Plex fonts are SIL OFL 1.1, each with its license file in its folder.

Please only make signatures for yourself or for organizations you're allowed to represent.
