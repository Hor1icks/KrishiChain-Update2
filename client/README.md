# KrishiChain Client

React + Vite. Phase 3 deliverable: the auth pages and the role-based routing
skeleton the 15 PRD pages will hang off.

## Setup

```bash
cd client
npm install
npm run dev          # http://localhost:5173
```

The API must be running too (`cd server && npm start`). `vite.config.js`
proxies `/api` to `http://localhost:5000`, so the browser only ever talks to
one origin and there is no CORS preflight in development.

## Pages

| Route | Access |
|---|---|
| `/login`, `/register` | public |
| `/dashboard` | any signed-in user — redirects to the role's home |
| `/farmer`, `/farmer/farms`, `/farmer/batches`, `/farmer/batches/new`, `/farmer/batches/:id` | FARMER |
| `/buyer`, `/buyer/browse`, `/buyer/bids`, `/buyer/batches/:id` | BUYER |

Storage, transport and admin are not built — they appear in the navbar greyed
out with a "Phase 2" tag, per PRD §11.3, so the full site map stays visible.

## Trying the demo loop

Two browsers (or one normal + one private window), so both sessions stay live:

1. **Buyer** — sign in as `tanvir.hossain@krishichain.bd`, Browse Listings,
   open a batch, place a bid above the standing one.
2. **Farmer** — sign in as `abdul.karim@krishichain.bd`, My Batches, open the
   same batch, and the bid is there. Accept it.
3. Back on the buyer's My Bids: the bid now reads WON with its sale order.

## Layout

```
src/
  api/client.js            fetch wrapper, bearer token, error unwrapping
  context/AuthContext.jsx  session state, login/register/logout
  components/              ProtectedRoute
  pages/                   Login, Register, Dashboard
```

## Notes

- **Seeded users share one demo password: `Demo@1234`.** Sign in as
  `abdul.karim@krishichain.bd` to land on a farmer who already has a sold batch
  and an open auction with live bids.
- **The register form is role-driven.** Picking a role swaps in that subclass's
  extra fields — `ROLE_FIELDS` in `RegisterPage.jsx` mirrors `SUBCLASS` in
  `server/src/services/auth.service.js`. Change one, change the other. The
  server validates required fields regardless of what the form sends.
- **Phone numbers repeat.** `{PhoneNo}` is a multivalued attribute, so the form
  lets you add more than one; each becomes a `USER_PHONE` row inside the same
  transaction as the user.
- **`ProtectedRoute` is convenience, not security.** The browser can be told
  anything; the server re-checks with `requireRole()` on every request.
- **Adding role modules (Phases 4-6):** add a route in `App.jsx` wrapped in
  `<ProtectedRoute roles={['FARMER']}>`, and the matching `/api/farmer` router
  on the server.
- **Import routing from `react-router`, not `react-router-dom`.** We are on
  React Router v8, where the `react-router-dom` wrapper package is gone — its
  exports moved into `react-router` itself. Copying a v6/v7 snippet off the web
  will give you a `react-router-dom` import that no longer resolves; drop the
  `-dom`. (We moved off v7 because `react-router-dom@7.18.2` carried a
  high-severity advisory, GHSA-qwww-vcr4-c8h2. `npm audit fix --force` would
  have *downgraded* to 7.11.0 — going forward to v8 was the correct fix.)
