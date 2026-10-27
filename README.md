# Northstar

A small, private hub for the everyday numbers that matter: savings goals, weight goals, a monthly budget, and a local photo-to-PDF tool.

One shared PIN opens the hub, Goals, and Budget. Goals syncs through Supabase so every phone sees the same data. Budget and Photo Pages stay on the device that uses them.

## What is inside

| App | What it does | Where data lives |
| --- | --- | --- |
| **Goals** | Per-person savings goals, dated contributions, recurring deposits, weight goals, weigh-ins, and a trend chart. | Supabase (shared), with a local cache |
| **Budget** | Monthly income, expenses, savings, and saved budget pages. | This browser's `localStorage` |
| **Photo Pages** | Turns selected photos into framed A4 PDF pages. | Your computer, via a local Node server |

The hub and both web apps share one PIN. The PIN is checked inside Postgres; the browser never reads the database tables directly.

## Folder layout

```text
.
├─ index.html                 hub + shared PIN gate
├─ hub.css
├─ .nojekyll                  keeps GitHub Pages from running Jekyll
├─ .gitignore                 keeps local caches and runtime data out of git
├─ scripts/
│  └─ check-supabase.mjs      read-only check that the RPCs are installed
├─ shared/
│  ├─ auth.js                 Supabase RPC client + PIN gate UI
│  └─ gate.css
├─ supabase/
│  └─ schema.sql              tables, RPCs, grants, PIN reset snippet
├─ apps/
│  ├─ goals/                  savings + weight tracker
│  │  ├─ index.html
│  │  ├─ app.js               shell, routing, sync, dialogs
│  │  ├─ styles.css
│  │  ├─ styles-extra.css
│  │  ├─ sw.js                offline shell
│  │  ├─ manifest.webmanifest
│  │  └─ js/
│  │     ├─ core.js           helpers, money, dates, icons
│  │     ├─ data.js           model, normalization, recurring rules
│  │     └─ views.js          pages, cards, chart
│  └─ budget/                 monthly budget planner
├─ tools/
│  └─ photo-pages/            local Node app + static info page
├─ extensions/                small browser/desktop helpers
├─ _archive/                  old copies kept out of the way
└─ serve.ps1                  tiny local static server
```

## Run it locally

From the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Open <http://localhost:8080>. The server serves the whole folder, so the hub, both apps, and the shared auth file all work.

To preview the Goals tracker without Supabase, open:

```text
http://localhost:8080/apps/goals/?local=1
```

That mode stores everything in the browser only and skips the PIN gate. It is useful for checking layout and interactions, not for real shared data.

### Photo Pages

Photo Pages is a separate Node app because it needs to read and write photo files:

```powershell
cd tools\photo-pages
npm install        # first time only
npm start
```

Open <http://127.0.0.1:4173>. It binds to localhost, so other devices cannot reach it. The hub card opens a short info page explaining this.

## Supabase setup

The project is already configured with:

- URL: `https://zgcemyiufqprjawsijsb.supabase.co`
- Publishable key: `sb_publishable_apXfNrH9krM8syYN1f0qNw_zCWp8oDC`

The publishable key is meant to be public. It cannot read the Northstar tables; it can only call the PIN-checked functions in `supabase/schema.sql`.

1. Open the [Supabase SQL editor](https://supabase.com/dashboard/project/zgcemyiufqprjawsijsb/sql/new).
2. Paste the whole contents of `supabase/schema.sql`.
3. Run it once. It is written to be safe to run again.
4. Open the hub. The first visit asks you to create a 6–12 digit PIN.
5. Open Goals and unlock with the same PIN. Budget uses the same PIN.

If a page says **One setup step left** and “Northstar is not installed on Supabase yet”, the SQL has not been run. If it says the server is unreachable, check the Supabase project status and the values at the top of `shared/auth.js`.

### Verify the database

After running the SQL, confirm the functions are live:

```powershell
node scripts/check-supabase.mjs
```

The check is read-only. It reads the project URL and publishable key from `shared/auth.js`, then asks Supabase for `northstar_status`. It prints one of:

- **Schema installed and the workspace has a PIN** — ready to use.
- **Schema installed. No PIN yet** — open the hub and create one.
- **northstar_status is not in the PostgREST schema cache** — the SQL is missing or was run against a different project/branch.

`PGRST202` means PostgREST reached the database but found no matching function. If the SQL was just run, wait a few seconds; `supabase/schema.sql` ends with `notify pgrst, 'reload schema';`, which refreshes the cache at commit. If the error persists, re-run the whole file and check the project ref in the dashboard URL matches `zgcemyiufqprjawsijsb`.

### How the PIN behaves

- First run creates the only workspace and stores a bcrypt hash of the PIN.
- Unlocking creates a random session token, stored as a hash in `northstar_sessions`.
- Sessions slide forward for 12 hours on use.
- Eight wrong PINs pause entry for 10 minutes.
- Changing the PIN in **Goals → Settings** signs out every other device.
- Locking a device signs that session out.

### Forgot the PIN

Run this in the SQL editor, then open the app and create a new PIN:

```sql
update public.northstar_workspace
   set pin_hash = crypt('new-pin-here', gen_salt('bf', 11)),
       failed_attempts = 0,
       locked_until = null
 where id = 1;

delete from public.northstar_sessions;
```

Replace `new-pin-here` with 6–12 digits before running it.

## Publishing to GitHub Pages

The site is ready for Pages: all paths are relative, so it works from `https://<user>.github.io/<repo>/`; `.nojekyll` stops GitHub from rewriting the files; and `.gitignore` keeps archives, `node_modules`, and Photo Pages data out of the repository.

Create a repository on GitHub, then either:

- **With Git installed:** from this folder, run `git init`, `git add .`, `git commit -m "Northstar"`, add the remote, and push to `main`.
- **Without Git:** use [GitHub Desktop](https://desktop.github.com/), or drag the project folder into GitHub's **Add file → Upload files** page. Do not upload `_archive`, `tools/photo-pages/node_modules`, or `tools/photo-pages/data`.

Then open the repository's **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save. GitHub publishes the site at `https://<user>.github.io/<repo>/`.

Things to know about hosting:

- Goals and the hub work from any static host. Supabase handles the shared data. The publishable key in `shared/auth.js` is safe to commit; it can only call the PIN-checked RPCs.
- Budget is static too, but its data stays in each browser.
- Photo Pages cannot run on GitHub Pages. The server needs Node.js and filesystem access; the hub links to its local-only info page instead.
- The service worker is scoped to `/apps/goals/`, so it caches the tracker shell without touching the hub or Budget.

## Using Goals

1. Pick a person with the switcher under the header, or tap **+** to add one.
2. Savings: create a goal with a target and optional target date, then add contributions. A recurring rule can add money weekly, every two weeks, or monthly.
3. Weight: set a starting weight, a goal weight, and a start date. Log weigh-ins from the Weight tab. Switch between kg and lb at any time; stored values stay in kilograms.
4. Settings: rename people, change currency or unit, change the PIN, sync now, export a JSON backup, or reset everything.

The app catches up recurring contributions the next time it opens, including on another device. If two devices save at the same time, the newer cloud revision wins and the app offers **Reload latest** or **Keep mine**.

## Backups

- **Goals:** Settings → **Export JSON**. Import the same file on another device or after clearing browser data.
- **Budget:** saved pages live in the browser. Use the same browser profile, or use the app's own saved pages before clearing site data.
- **Photo Pages:** copy the `tools/photo-pages/data/` folder while the server is stopped.

## Development notes

- The Goals app is split into `core.js`, `data.js`, `views.js`, and `app.js`. Script order matters: `shared/auth.js`, then `core.js`, `data.js`, `views.js`, `app.js`.
- `NG.state` holds shared runtime state for the views.
- `supabase/schema.sql` revokes table access from `anon` and exposes only the RPCs used by `shared/auth.js`.
- Service worker cache name is bumped when shell files change (`apps/goals/sw.js`).
