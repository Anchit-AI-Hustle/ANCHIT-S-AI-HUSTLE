# Vahdam US Flows — Image Change Pipeline

Autonomous marketing-ops tool that processes the **22 VAHDAM US post-purchase
email templates** (`PP#01_V4` → `PP#22_V4`) from
<https://postpurchase-tan.vercel.app/usa/>:

1. **Discovers** all 22 flows from the index page.
2. **Extracts** each email's full HTML, every `<img src>`, the subject, body
   copy, and footer.
3. **Swaps the hero packet** — composites `vahdam_packet_extracted_transparent.png`
   over the hero image → `ppNN_updated_hero.png`.
4. **Writes** a row per template into your Google Sheet (13 columns, in spec
   order — idempotent: re-runs update existing rows).
5. **Saves** all heroes + a CSV to `~/Desktop/Vahdam-US-Flows-ImgChange`, zips
   it, and **uploads** to Google Drive with sharing.

It **checkpoints after every flow** (`.state/progress.json`), so a crash or a
mid-run logout resumes instead of redoing work.

> **Why not a Klaviyo login?** The public `/usa/` site embeds each email as a
> static `screens/pp-NN.html` file and only links to a generic `klaviyo.com`
> URL — there are no per-template Klaviyo URLs to open. So extraction needs no
> login. If you *do* have Klaviyo template URLs, see "Klaviyo mode" below.

## Setup

```bash
npm install
npx playwright install chromium   # only needed for --use-klaviyo
```

Drop the packet PNG into `assets/vahdam_packet_extracted_transparent.png`
(see `assets/README.md`).

## Run

```bash
# Core pipeline — no Google needed. Heroes + CSV land on your Desktop.
npm run run -- --skip-sheets --skip-drive

# Just list what would be processed:
npm run discover

# Full run (Sheet + Drive). Requires Google creds in .env (see below).
npm run run
```

### Useful flags

| Flag | Effect |
|------|--------|
| `--start N --limit K` | Process K flows starting at sequence N (e.g. `--start 1 --limit 3`). |
| `--no-overlay` | Skip the packet composite; save originals, note "No packet". |
| `--skip-sheets` / `--skip-drive` | Skip the Google steps. |
| `--fresh` | Ignore checkpoint and reprocess everything. |
| `--force` | Reprocess flows even if already in the checkpoint. |
| `--use-klaviyo` | Pull HTML from Klaviyo (needs `klaviyo-map.json`). |
| `--auth-only` | Just run/verify the Google consent flow. |

## Google setup (Sheets + Drive)

1. Google Cloud Console → **APIs & Services → Credentials** → *Create
   credentials* → **OAuth client ID** → **Desktop app**.
2. Enable the **Google Sheets API** and **Google Drive API** for the project.
3. Copy `.env.example` → `.env` and fill `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`. The target `SHEET_ID`/`SHEET_GID` are pre-filled.
4. First run opens a browser for consent; the token is cached to `.gtoken.json`.

The pipeline writes to the tab with `gid=1314990366` and creates the 13 columns
if they're missing:

`Sequence · Template Name · Link · Template ID · Brand · Image Asset ·
Image Note · Header / Subject · Full Body Copy · Footer · Image URL ·
Full HTML Code · Image Links`

## Klaviyo mode (optional)

If you have real Klaviyo template URLs, copy `klaviyo-map.example.json` →
`klaviyo-map.json`, fill in URLs/IDs per template, then:

```bash
npm run run -- --use-klaviyo
```

A persistent, **headful** Chromium opens; log in (and clear 2FA) once — the
session is saved in `.browser-profile/` so later runs skip the login. Press
ENTER in the terminal after logging in, and it proceeds through every mapped
flow automatically.

## Output

- `~/Desktop/Vahdam-US-Flows-ImgChange/` — `ppNN_hero.*`, `ppNN_updated_hero.png`, `vahdam-us-flows.csv`
- `~/Desktop/Vahdam-US-Flows-ImgChange.zip`
- Your Google Sheet, fully populated
- A Drive folder (link printed at the end)
