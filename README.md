# Tailor-Made Newspaper

Personal morning newspaper for Alessandro Armiento: one printable A4 page with today’s weather (Rome by default), top world headlines, and email reminders.

Italian UI copy. Working product name: **Tailor-Made Newspaper** (rename later if needed).

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Print stylesheet (`@media print`, A4)

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

Production-style local run:

```bash
npm run build
npm start
```

## Print

1. Open the app in the browser.
2. Click **Stampa** (or use the browser print dialog).
3. Choose A4, one page, backgrounds optional.

## Data sources

| Section | Live source | Fallback |
| --- | --- | --- |
| Weather | [Open-Meteo](https://open-meteo.com/) (no API key) | Built-in mock for Rome |
| World news | BBC World RSS | Built-in sample headlines |
| Email reminders | — | Mock data only |

Configure the weather city in `src/lib/config.ts`.

Replace mock reminders by editing `src/lib/reminders.ts` (documented extension point; no auth/db in this slice).

## Project layout

- `src/app/page.tsx` — edition assembly
- `src/components/newspaper/` — masthead, weather, news, reminders, print toolbar
- `src/lib/` — config, weather, news, reminders, formatting
