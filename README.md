# Roomio — Move-in Checklist

A lightweight web app that turns a house move-in checklist into browsable
category cards with search, filters, and progress tracking — no more
scrolling through Excel.

## Features

- **22 category cards** (Bedroom, Kitchen, Bathroom, Workstation, etc.) each
  with its own progress bar and item list.
- **326 checklist items**, each with priority (Essential / Useful / Optional
  / As needed), quantity, and notes.
- **Search** across item names and notes.
- **Filter by priority** and **hide completed** items.
- **Progress persists** in the browser (`localStorage`), so checking items
  off sticks around between visits — no login or backend needed.
- **Reset progress** button to start over.
- Responsive layout, light/dark mode (follows system preference).

## Running locally

No build step — it's plain HTML/CSS/JS. Serve the folder with any static
file server (needed because the app `fetch()`s `data/checklist.json`, which
browsers block over `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or with Node: `npx serve .`

## Project structure

```
index.html            Page markup + <template>s for cards/items
css/styles.css         Styling, theming (light/dark)
js/app.js              Rendering, filters, search, localStorage persistence
data/checklist.json    The checklist content (source of truth for the UI)
data/source-checklist.xlsx  Original uploaded spreadsheet, kept for reference
```

## Updating the checklist

Edit `data/checklist.json` directly, or regenerate it from a spreadsheet.
Each category is:

```json
{
  "id": "kitchen",
  "name": "Kitchen",
  "icon": "🍳",
  "items": [
    { "id": "kitchen--plates", "name": "Plates", "priority": "Essential", "qty": 4, "notes": "2-4 is enough for one person" }
  ]
}
```

`id` values must stay stable once someone has started checking items off —
they're the localStorage keys. Renaming an item's `id` resets its progress.
`priority` should be one of `Essential`, `Useful`, `Optional`, `As needed`
to get a matching color badge.
