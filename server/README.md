# KrishiChain API

Express + node-oracledb against Oracle XE 11.2. Phase 3 deliverable: the
auth surface and the registration atomic transaction.

## Setup

```bash
cd server
npm install
cp .env.example .env      # then edit .env for your machine
npm start
```

Two things in `.env` that will bite you:

- **`ORACLE_CLIENT_DIR`** must point at your unzipped Oracle Instant Client 19c
  folder. node-oracledb's default Thin mode requires Database 12.1+ and cannot
  reach XE 11.2 at all, so Thick mode is mandatory. A `DPI-1047` error means
  the client, XE and Node.js are not all the same bitness — it is almost never
  a missing file.
- **`DB_PASSWORD` must be quoted if it contains a `#`.** Unquoted, `#` starts
  a comment in a `.env` file, so e.g. `DB_PASSWORD=Example#2026` silently
  becomes `Example` and you get `ORA-01017: invalid username/password`.

The API runs on **port 5000**, not 8080 — XE's bundled APEX already holds 8080.

## Endpoints

| Method | Path                 | Auth   | Notes |
|--------|----------------------|--------|-------|
| GET    | `/api/health`        | –      | Round-trips a query to prove the pool is live |
| GET    | `/api/auth/roles`    | –      | The five roles, for the register form's dropdown |
| POST   | `/api/auth/register` | –      | The atomic registration transaction |
| POST   | `/api/auth/login`    | –      | Returns `{ user, token }` |
| GET    | `/api/auth/me`       | Bearer | Profile, including the computed `age` |
| GET    | `/api/reference/crops`, `/arats` | Bearer | Lookup lists for forms |
| —      | `/api/farmer/*`      | FARMER | Dashboard, farms, batches, bids, **award** |
| —      | `/api/buyer/*`       | BUYER  | Dashboard, browse, batches, **place bid**, my bids |

## Layout

```
src/
  config/env.js       validated environment
  config/db.js        Thick-mode init, pool, withTransaction()
  services/           business logic + the PRD §9.10 transactions
  routes/             thin HTTP layer, no SQL
  middleware/         authenticate, requireRole, error handling
  utils/ApiError.js   status-carrying errors
```

## Transactions implemented (PRD §9.10)

Three of six. Each is one `withTransaction()` call — commits on return, rolls
back on throw — and each was verified by **fault injection**: a temporary
`CHECK (...) ENABLE NOVALIDATE` constraint armed so a late statement fails, then
confirming nothing from the earlier statements persisted.

| # | Transaction | Where | Rollback proven by |
|---|---|---|---|
| 1 | Registration | `auth.service.js` | duplicate NID → no orphan `USERS` row |
| 3 | Place Bid | `buyer.service.js` | failed INSERT → standing bid stayed ACTIVE |
| 4 | Award Winning Bid | `farmer.service.js` | failed `TRANSPORT_REQUEST` → batch unsold |

Not built: Storage allocation (#2), Assign Transport (#5), Delivery + Payment (#6).

`ENABLE NOVALIDATE` matters for that testing technique — a plain
`ADD CONSTRAINT` fails with `ORA-02293` because the existing rows violate it.

## The registration transaction

`POST /api/auth/register` is transaction #1 of the six in PRD §9.10. Three
writes that must all land or none:

1. `USERS` — `UserID` comes from `trg_user_id` / `seq_user_id`, since 11g has
   no `IDENTITY` columns. Read back with `RETURNING UserID INTO`.
2. the subclass row (`FARMER` / `BUYER` / `ADMIN_STAFF` / `STORAGE_MANAGER` /
   `TRANSPORT_PERSONNEL`) — its PK *is* that `UserID` (shared-PK
   specialization, no discriminator column).
3. `USER_PHONE` — zero or more rows, the multivalued attribute.

A half-committed registration would leave a `USERS` row with no subclass row,
breaking the total-specialization guarantee the data model rests on. Verified
by deliberately failing step 2 (duplicate NID): the `USERS` row did not
persist, and no user in the schema lacks a subclass row.

`config/db.js` sets `oracledb.autoCommit = false` globally. Leave it that way —
the remaining five workflows have the same all-or-nothing requirement.

## Notes

- **Seeded users share one demo password: `Demo@1234`.** All 25 rows from
  `03_insert_data.sql` carry a real bcrypt hash of it, so any of them can be
  signed into. `abdul.karim@krishichain.bd` is a farmer with an open auction
  and live bids — the shortest path to the award-winning-bid demo. This is
  local demo seed data; never ship a shared published password.
- **Age is computed, not stored.** Oracle 11g virtual columns reject
  non-deterministic expressions like `SYSDATE`, so `USERS./Age/` from the ER
  diagram cannot be a `GENERATED ALWAYS` column. Phase 4's `04_views.sql`
  exposes the same calculation as a view.
- **Constraint names are user-facing.** `auth.service.js` maps `UQ_USERS_EMAIL`
  and friends to readable messages. That is what the `PK_`/`FK_`/`UQ_`/`CK_`
  naming convention in PRD §9.9 is for.
- **`ORA-20001` / `ORA-20002`** from `trg_payment_biz_rules` are business rules
  (BR-19, BR-20), not server faults — `errorHandler.js` surfaces them as HTTP
  422 with the trigger's own message.
