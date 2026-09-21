# Setup — make The Daily Tailor yours

This guide is for anyone who clones the public repo and wants a morning paper with **their** weather, calendar, mail, reminders, and news — the same setup path used by the author, with **your** credentials.

You run **your own instance**. There is no shared SaaS. Never point strangers at a live deployment that holds private mail or calendars.

**License:** [ANCA 1.0](https://github.com/alessandroarmiento-lang/ANCA) — personal / educational / research; **no commercial use**. Keep [`CREDITS.md`](CREDITS.md) and on-screen credits visible.

---

## 1. Install and run (local)

```bash
git clone https://github.com/alessandroarmiento-lang/the-daily-tailor.git
cd the-daily-tailor
npm install
cp .env.example .env.local
# edit .env.local (sections below)
npm run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847).

| Do | Do not |
| --- | --- |
| Keep secrets only in `.env.local` (gitignored) | Commit `.env.local`, app passwords, or `REMINDERS_INGEST_TOKEN` |
| Copy `public/owner-prefs.example.json` → `public/owner-prefs.json` if you want a default UI language | Expect the author’s Fly URL to show *your* data |

---

## 2. What you personalize (checklist)

| Piece | Where | Required? |
| --- | --- | --- |
| Product name / tagline | `.env.local` → `NEXT_PUBLIC_*` | Optional |
| Default UI language | `public/owner-prefs.json` | Optional (public default = English) |
| Weather city fallback | `WEATHER_*` | Recommended |
| News RSS | `NEWS_FEED_URL` | Optional (default: Il Post Mondo) |
| Timezone / edition rollover | `NEWSPAPER_TIMEZONE` | Recommended |
| Mail (action emails) | IMAP iCloud and/or Gmail **or** Mac Mail.app | One path |
| Calendar (agenda) | CalDAV / EventKit | One path |
| Reminders | EventKit (Mac awake) **or** iPhone Shortcut push (Mac-off) | One path |
| Aphorisms | `src/lib/aphorism.ts` | Optional |
| Always-on host (06:00 warm) | Fly.io (`deploy/fly/`) | Optional but recommended for Mac-off |
| iPhone Home Screen | Safari → Add to Home Screen | Optional |

---

## 3. Branding and language

In `.env.local`:

```bash
NEXT_PUBLIC_PRODUCT_NAME=The Daily Tailor
NEXT_PUBLIC_PRODUCT_TAGLINE=Your one-page morning paper
```

Restart `npm run dev` after changing `NEXT_PUBLIC_*`.

**UI language**

1. Copy `public/owner-prefs.example.json` → `public/owner-prefs.json` (gitignored).
2. Set `"defaultLang": "en"` or `"it"`.
3. Readers can still switch with **EN · IT** in the toolbar.

---

## 4. Weather

- On open, the PWA asks for **geolocation once** (browser permission). After grant, the sheet uses that fix and stores it for the 06:00 warm.
- Fallback when GPS was never shared: `WEATHER_CITY`, `WEATHER_LAT`, `WEATHER_LON` in `.env.local`.
- Default provider: Open-Meteo (`WEATHER_PROVIDER=open-meteo`). WeatherKit is optional (see `.env.example`).

Example (Rome):

```bash
WEATHER_CITY=Roma
WEATHER_LAT=41.9028
WEATHER_LON=12.4964
WEATHER_PROVIDER=open-meteo
```

Force a position in the browser (does not overwrite the stored fix): `/?lat=41.90&lon=12.50`.

---

## 5. News

```bash
NEWS_FEED_URL=https://www.ilpost.it/mondo/feed/
NEWS_MAX_ITEMS=6
```

Any RSS URL works if the adapter can parse it; keep a trailing slash when the feed requires it. Raise/lower `NEWS_MAX_ITEMS` carefully — print is hard-locked to **one A4**.

---

## 6. Timezone and morning edition

```bash
NEWSPAPER_TIMEZONE=Europe/Rome
```

At rollover (06:00 in that timezone on the always-on host), a **warm** builds today’s JSON under `data/editions/` (or `EDITIONS_DIR`). The phone downloads `/api/edition/today` and keeps it offline (IndexedDB + Cache API).

Manual warm (local or SSH to host):

```bash
curl -fsS 'http://127.0.0.1:3847/api/morning-warm?force=1'
# production example:
# curl -fsS 'https://YOUR-APP.fly.dev/api/morning-warm?force=1'
```

---

## 7. Choose an operating mode

### A) Mac awake (simplest on the author’s Mac)

App runs on the Mac; adapters talk to **Mail.app / Calendar / Reminders** via EventKit / Automation.

```bash
./scripts/macos/grant-apple-access.sh
```

Approve **Calendars**, **Reminders**, and (if used) **Automation → Mail** in System Settings → Privacy. Leave `ACTION_EMAIL_SOURCE`, `CALENDAR_SOURCE`, `REMINDERS_SOURCE` as `auto`.

Optional local warm at 06:00:

```bash
./deploy/macos/install-morning-launchd.sh
```

### B) Mac off / always-on host (recommended for daily use)

IMAP + CalDAV credentials in `.env.local`, deploy to **Fly.io**, push Reminders from the **iPhone** (CloudKit Reminders are not on CalDAV).

---

## 8. Mail (action emails) — IMAP

Create **app-specific passwords** (never your main account password):

- Apple ID: https://appleid.apple.com → Sign-In and Security → App-Specific Passwords  
- Google: https://myaccount.google.com/apppasswords (2FA required)

In `.env.local` fill **at least one** provider:

```bash
ICLOUD_MAIL_USER=you@icloud.com
ICLOUD_MAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

`ACTION_EMAIL_SOURCE=auto` uses IMAP when credentials exist. Caps: `ACTION_EMAIL_MAX_ITEMS`, `ACTION_EMAIL_LOOKBACK_DAYS`.

---

## 9. Calendar (agenda) — CalDAV

iCloud CalDAV reuses `ICLOUD_MAIL_*` if you do not set overrides. Google Calendar CalDAV reuses `GMAIL_*` and discovers legacy collections (primary, shared, holidays, …).

Optional overrides — see comments in `.env.example` (`ICLOUD_CALDAV_*`, `GOOGLE_CALDAV_*`).

Birthdays: Google “Birthdays” CalDAV + iCloud Contacts CardDAV when configured. Plain iCloud calendars alone do not include Contacts birthdays.

Horizon: `CALENDAR_HORIZON_DAYS` (clamped 1–6 for the one-page layout).

---

## 10. Reminders

Apple Reminders on CloudKit are **not** readable via CalDAV on a headless host.

| Situation | What to do |
| --- | --- |
| Mac awake | EventKit (`REMINDERS_SOURCE=auto`) after `grant-apple-access.sh` |
| Mac off / Fly | iPhone Shortcut → `POST /api/reminders/ingest` |

### Generate ingest token

```bash
openssl rand -hex 32
# paste into .env.local:
REMINDERS_INGEST_TOKEN=…your hex…
```

### Build the iOS Shortcut (Mac)

Point `--host` at **your** public URL (not someone else’s):

```bash
python3 scripts/macos/build-reminders-shortcut.py \
  --host "https://YOUR-APP.fly.dev" \
  --output ~/Desktop/"Send reminders to newspaper.shortcut"
```

1. Double-click the `.shortcut` → tap **Add** on the iPhone (human step; cannot be automated).
2. Create an Automation at **05:55** (before the 06:00 warm): run the shortcut with **Run Shortcut**, not **Open**.
3. Optional Mac push while awake: `./scripts/macos/push-reminders-to-host.sh --warm`

The signed `.shortcut` embeds the token → treat the file as a secret (mode 0600; do not commit).

---

## 11. Aphorisms (optional)

Edit the curated list in [`src/lib/aphorism.ts`](src/lib/aphorism.ts) (`text` / `textEn` / attributions). Selection is deterministic by edition date in `NEWSPAPER_TIMEZONE`.

---

## 12. Fly.io always-on host

1. Install CLI and log in: https://fly.io/docs/flyctl/install/ · `fly auth login`
2. Pick a **unique** app name (default `the-daily-tailor` may be taken):

```bash
# edit fly.toml → app = "your-unique-name"
export FLY_APP=your-unique-name
export FLY_REGION=fra   # or your region
```

3. Set weather/news/timezone defaults in `fly.toml` `[env]` to **your** city/feed if you want (secrets stay in Fly secrets, not in git).
4. Deploy:

```bash
./deploy/fly/deploy.sh
```

This creates the app/volume if needed, imports secrets from `.env.local` (names only logged), and deploys. Mail: **at least one** of iCloud or Gmail pairs is required. Add `REMINDERS_INGEST_TOKEN` for iPhone push.

5. Verify:

```bash
fly ssh console --app "$FLY_APP" -C "curl -fsS 'http://127.0.0.1:8080/api/morning-warm?force=1'"
open "https://${FLY_APP}.fly.dev/"
```

6. iPhone: Safari → that URL → **Share → Add to Home Screen**. First open after warm downloads today’s edition for offline use.

Details: `Dockerfile`, `fly.toml`, `deploy/fly/`.

---

## 13. Verify your personalization

| Check | How |
| --- | --- |
| Sheet loads | Open `/` — masthead shows your `NEXT_PUBLIC_PRODUCT_NAME` |
| Weather | Allow location once; kicker shows your place (or fallback city) |
| Agenda | Events from *your* calendars for the horizon |
| Mail | Latest actionable messages from *your* IMAP/Mail |
| Reminders | Open items from EventKit or a fresh iPhone push (`GET /api/reminders/ingest` with token) |
| News | Headlines from *your* `NEWS_FEED_URL` |
| Warm | `morning-warm?force=1` writes `data/editions/YYYY-MM-DD.json` |
| Print | Optional **Print** → single A4, never page 2 |

If a section errors instead of inventing data, that is intentional: personal sections do not silently fall back to fixtures when sources are `auto`.

---

## 14. Security reminders

- Never commit `.env.local`, Fly secret dumps, or signed `.shortcut` files.
- Prefer app-specific passwords; revoke them if a device is lost.
- Do not advertise a personal live URL as a public demo.
- Keep ANCA credits and `CREDITS.md` intact.

---

## 15. Reference map

| Need | File / command |
| --- | --- |
| All env knobs | [`.env.example`](.env.example) |
| Runtime config | [`src/lib/config.ts`](src/lib/config.ts) |
| Language prefs | [`public/owner-prefs.example.json`](public/owner-prefs.example.json) |
| Aphorisms | [`src/lib/aphorism.ts`](src/lib/aphorism.ts) |
| Apple TCC helpers | `./scripts/macos/grant-apple-access.sh` |
| Reminders Shortcut | `python3 scripts/macos/build-reminders-shortcut.py --host …` |
| Fly deploy | `./deploy/fly/deploy.sh` |
| Product overview | [`README.md`](README.md) |
