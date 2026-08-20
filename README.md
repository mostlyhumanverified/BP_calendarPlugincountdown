# Meeting Countdown Link for Google Calendar

A Chrome extension that adds a button to Google Calendar's event editor. Click
it, confirm the meeting's end time, and it inserts a link into the event
description that shows invitees a live countdown to the end of the meeting.

The project has two parts:

- **`extension/`** — the Chrome (Manifest V3) extension that injects the
  button into `calendar.google.com`.
- **`docs/countdown.html`** — the self-contained countdown page the inserted
  link points to. Meant to be served via GitHub Pages from this repo.

## How it works

1. You're creating or editing an event in Google Calendar.
2. Click the **⏳ Add countdown link** button that appears near the
   description field (or the floating **⏳ Countdown link** button in the
   bottom-right corner if the description field couldn't be auto-detected).
3. A small popup asks you to confirm the meeting's end time (pre-filled with
   a best-effort guess) and the link's label text.
4. Click **Insert link** — a link is added to the top of the description,
   e.g. `https://.../countdown.html?to=2026-08-20T22:00:00.000Z&title=Q3+Planning+Sync`.
5. Anyone who opens that link sees a live countdown to the meeting's end
   time, in their own timezone, in light or dark mode.

If the description field can't be found (Google occasionally changes its
page structure), the link is copied to your clipboard instead, with a toast
telling you to paste it in manually — the extension never fails silently.

## 1. Set up the countdown page (GitHub Pages)

1. In this repo, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Pick the branch this was merged into (e.g. `main`) and the **`/docs`**
   folder, then save.
4. GitHub will publish the page at:
   ```
   https://mostlyhumanverified.github.io/BP_calendarPlugincountdown/countdown.html
   ```
   That URL is already the extension's default — you don't need to configure
   anything else if you use it as-is.

If you'd rather host `countdown.html` somewhere else, just copy the file
anywhere that can serve static HTML (Netlify, Vercel, S3, your own server,
etc.) and set the extension to point at it (see below).

## 2. Install the extension

Chrome extensions that aren't on the Web Store are installed "unpacked":

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this repo's `extension/` folder.
4. The hourglass icon should appear in your toolbar.

To point the extension at a different countdown page (only needed if you're
not using the default GitHub Pages URL above): click the extension's icon →
enter your URL → **Save**.

## 3. Use it

Go to [calendar.google.com](https://calendar.google.com), create or edit an
event, and look for the **⏳ Add countdown link** button next to the
description field.

> **Note on reliability:** Google Calendar's page markup is unofficial and
> changes over time, so the button placement and the end-time guess are
> best-effort. The end time is always shown to you for confirmation before
> anything is inserted, and if the description field can't be found at all,
> the link is copied to your clipboard instead so the feature still works —
> you just paste it in yourself. If the button stops appearing after a
> Google Calendar update, please open an issue; the selectors in
> `extension/content.js` are isolated and easy to update.

## Development notes

- No build step — the extension is plain HTML/CSS/JS, loaded directly by
  Chrome.
- `extension/config.js` holds the default countdown page URL and the
  `chrome.storage.sync` key used to override it from the options page.
- `extension/content.js` is defensive by design: it tries several selector
  strategies (including piercing open shadow roots) to find the title and
  description fields, never trusts its own end-time guess without user
  confirmation, and always has a clipboard fallback.
- `docs/countdown.html` has no dependencies and no build step — it reads
  `to` (ISO 8601 timestamp) and `title` query params and renders a live
  countdown, with a light/dark theme driven by `prefers-color-scheme`.
