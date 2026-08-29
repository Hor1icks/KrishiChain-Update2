# KrishiChain — front-end demo build

A copy of the full React client with the network layer replaced, so all 27
pages run with **no Express server and no Oracle database**.

```bash
npm install
npm run dev          # http://localhost:5173
```

Sign in with any of the five role buttons on the sign-in page. Password for
every account is `Demo@1234`.

See `../README.md` for the page-by-page guide and the demo walkthrough.

## What differs from `client/`

| | |
|---|---|
| `src/api/client.js` | Rewritten. Same exports and same call signature, but answers `GET` from bundled fixtures and refuses writes with a readable message. **This is the entire decoupling** — no page component was changed to make it work. |
| `src/demo/fixtures/` | 82 endpoint responses across the five roles, recorded from the live API by `../tools/record-fixtures.mjs`. Recorded rather than authored, because a hand-written fixture with one field name wrong renders as a blank page instead of an error. |
| `src/pages/LoginPage.jsx` | Role buttons, so nobody types an email address mid-presentation. |
| `src/components/NavBar.jsx` | A `demo data` badge, so recorded data is never mistaken for a live connection. |
| `public/fonts/` | Archivo and IBM Plex Mono bundled instead of loaded from Google's CDN — a room with no internet would otherwise drop the page to system fonts silently. |
| `vite.config.js` | The `/api` proxy is gone. There is nothing to proxy to. |
| `src/pages/admin/DailyPrices.jsx` | The "Logged by" column is gone, matching the schema change that removed `DAILY_MARKET_PRICE.LoggedBy`. |

## Read-only, on purpose

Reads all work. Writes are switched off and say so:

> This is the front-end demo build, so actions are switched off — there is no
> database behind it to save to. The full build writes this straight to
> Oracle.

Every page already renders a thrown error in its own error banner, so a
clicked button explains itself rather than failing silently or crashing.

## Regenerating the fixtures

Only needed if the front end gains a page that calls a new endpoint. Requires
the full stack running (`server/` on :5000 against a seeded database):

```bash
node ../tools/record-fixtures.mjs
```

It logs in as one user per role, walks every endpoint the front end calls,
follows list responses to pick up per-id detail routes, and rewrites
`src/demo/fixtures/`. Any endpoint it cannot reach is reported at the end
rather than written as an empty result.
