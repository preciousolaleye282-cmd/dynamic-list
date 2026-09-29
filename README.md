# Dynamic List — Ultimate To-Do dashboard

A dark, responsive to-do dashboard built with plain **HTML, CSS and JavaScript** — no
frameworks, no build step, no dependencies. The layout is influenced by the two design
references kept in this folder:

| Reference | What it inspired |
| --- | --- |
| `Nice Layout.jpg` | The "Ultimate To-Do" Notion-template look: live clock, today's-progress ring, calendar widget with a "month ends in" countdown, tabbed To-Do/Completed panels, priority & difficulty tags, per-task status pills |
| `transparent design.png` | The "G.Take" dashboard shell: dark navy palette, left rail navigation, top bar with breadcrumb, search, reminders and profile, "Make Things Simple!" hero, Today note, My files and Activity cards |

## Features

**Tasks**
- Create tasks from the quick-add bar or the full editor (title, description, priority,
  difficulty, category, due date and time)
- Complete, reopen, edit, delete and clear completed tasks
- **Drag & drop** reordering with a drop-target highlight
- Per-task status: `Done`, `In progress`, `On track`, `Late` (computed from the due date/time)
- Attach files to a task (stored inline when under 600 KB) and download them again
- Live search across title, description and category
- Filter by priority, difficulty and category; sort by my order, due date, priority, newest or A→Z

**Views**
- **Dashboard** — stat cards, task panel, completed panel and the widget column
- **Tasks** — all tasks with a breakdown panel and "up next"
- **Calendar** — month grid with per-day tasks, day selection and a next-7-days list
- **Activity** — weekly and monthly completion charts plus a downloadable text report
- **Notes** — titled notes with search, and "pin to dashboard"
- **My files** — drop zone, file list and attach-file-to-task
- **Settings** — light/dark theme, four accent colours, compact density, export/import and reset

> The board starts **empty** — no sample or demo tasks are shipped.

**Quality of life**
- Everything is stored in `localStorage` — no server, no account
- Toasts with a one-click **Undo** for every destructive action
- Reminders popover (overdue + due today) and sidebar badges
- Keyboard shortcuts: `N` new task · `/` search · `Esc` close/clear · `1`–`7` switch views
- Responsive down to small phones; respects `prefers-reduced-motion`
- Accessible: labelled controls, focus-visible outlines, `aria` roles on the dialog and popover

## Run it locally

It is a static site, so any of these work:

```bash
# Option 1 — just open the file
start index.html

# Option 2 — local server (recommended, matches the tested setup)
python -m http.server 5510
# then visit http://127.0.0.1:5510/index.html
```

## Project structure

```
index.html   markup for all seven views, the task dialog and the reminders popover
style.css    design tokens, layout, components, animations and responsive rules
app.js       state, persistence, rendering, event handling and keyboard shortcuts
_uitest.html automated UI regression suite (see below)
Nice Layout.jpg         design reference
transparent design.png  design reference
```

The code is organised into clearly commented sections (constants → date helpers →
state → queries → rendering → actions → views → events → boot), and every render
function is pure enough to re-run safely at any time.

## Testing

`_uitest.html` is a black-box UI suite: open it in a browser and it drives the real UI
inside an iframe — clicking, typing, dragging and asserting the result — then prints a
pass/fail summary. Because the app ships with an empty board, the suite creates its own
fixtures at the start. Current status: **97 assertions, 97 passing, 0 JavaScript errors**.

It found three genuine bugs during development (unwired drag & drop, no way to reopen a
completed task once the undo toast expired, and an off-by-one when dragging downwards).

## Data & privacy

All data lives in the browser under the `dynamic-list-v1` key (older saves under
`ultimate-todo-v1` are migrated automatically). Use **Settings → Export** for a JSON
backup. Nothing is ever sent anywhere.

## Notes

The original brief also linked a Claude artifact for reference. That link requires a
signed-in session, so the feature set here was derived from the two design images in this
folder plus standard to-do patterns.

## License

MIT
