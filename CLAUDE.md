# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

KrishiChain is a university DBMS course project (CSE-302, Military Institute of Science and
Technology) — an agricultural supply-chain system (Farm → Virtual ARAT → Buyer) built to
demonstrate an advanced Oracle relational design through a real React/Express front end.

The full spec lives in `KrishiChain_PRD_v3.md` — treat it as the source of truth for schema,
business rules, and scope. Read it (or the relevant section) before making design decisions;
don't re-derive things it already answers. Key sections: §0 Design Decisions, §7 ER constructs,
§8 Business Rules, §9 Relational Schema + Oracle 11g standards, §11 Architecture/front-end plan.

**Current state:** Phases 1–4 done and verified against the live database, plus the buyer and
storage modules from Day 5. On disk: `Phase1/` (environment proof), `database/` (schema, seed, six
views, five advanced queries, a read-only inspection script), `server/` (Express API: auth,
reference, farmer, buyer, storage), `client/` (React + Vite, 12 pages). **Not built yet:**
transport and admin modules — check before referencing anything else from PRD §11.2.

Four of the six PRD §9.10 transactions are implemented: Registration, Storage Allocation, Place
Bid, Award Winning Bid. Assign Transport and Delivery+Payment are not.

**Every transaction was verified by fault injection**, and new ones should be too: arm a temporary
`ALTER TABLE ... ADD CONSTRAINT ... CHECK (...) ENABLE NOVALIDATE` so a *late* statement fails,
call the endpoint, confirm the earlier statements left nothing behind, then drop it.
`ENABLE NOVALIDATE` is required — a plain `ADD CONSTRAINT` fails with `ORA-02293` against existing
rows.

Running decision/status log: `context.md`. Read it before making design calls — it records what
was decided and why, including several deltas from the PRD and ER blueprint.

## Commands

There is no root `package.json`; `server/` and `client/` are separate npm projects.

```
cd server && npm install && cp .env.example .env && npm start   # API on :5000
cd client && npm install && npm run dev                         # UI on :5173
cd client && npm run build                                      # only real "does it compile" check
```

No lint or test tooling has been chosen — don't invent lint/test commands.

`server/.env` gotcha: **quote the password.** An unquoted `#` starts a comment in a `.env` file,
so `DB_PASSWORD=Krishi#2026` parses as `Krishi` and yields `ORA-01017`.

SQL files are run in SQL Developer (F5 = Run Script, not Ctrl+Enter — `02_sequences_triggers.sql`
contains PL/SQL blocks terminated with `/`) or SQL*Plus:

```
sqlplus krishichain/"Krishi#2026"@localhost:1521/XE @database/99_inspect_data.sql
```

- `database/01_create_tables.sql`, `02_sequences_triggers.sql` — already applied; re-running the
  first yields `ORA-00955` on every statement, which is expected, not a failure.
- `database/03_insert_data.sql` — **wipes every table before re-seeding.** Idempotent by design,
  but never run it just to look at data.
- `database/04_views.sql` — six views, all `CREATE OR REPLACE`, safe to re-run.
- `database/05_advanced_queries.sql`, `database/99_inspect_data.sql` — read-only. Run these
  for inspection.

`Phase1/00_environment_check.sql` is one-time-per-machine setup: run as SYSTEM (checks 1–4,
creates the `krishichain` app user), then reconnect as `krishichain` for Check 5.
`Phase1/test_connection.js` proves Thick-mode connectivity; edit `INSTANT_CLIENT_DIR` at the top
first — it must point at the unzipped Instant Client 19c directory, not a OneDrive-synced path.

## Architecture and non-obvious constraints

**Database is Oracle 11gR2 XE (11.2.0.2.0) — this drives almost every backend decision:**

- **node-oracledb must run in Thick mode.** The default Thin mode requires Database 12.1+ and
  cannot connect to 11.2 at all. `oracledb.initOracleClient({ libDir: ... })` must execute before
  any `getConnection()`/`createPool()` call, using Oracle Instant Client 19c.
- **No `IDENTITY` columns.** Every surrogate PK needs a `sequence` + `BEFORE INSERT` trigger pair
  (24 tables → 24 pairs). Follow the naming convention `seq_<table>_id` / `trg_<table>_id`.
- **No `FETCH FIRST n ROWS`.** Row-limiting must use `ROWNUM` inside an inline view.
- **Self-referencing FKs break seed order**: `VIRTUAL_ARAT.ParentAratID` and `BID.PreviousBidID`
  must be inserted NULL first, then `UPDATE`d to link — see the insert order in PRD §14.
- **Bengali text**: every column that may hold Bengali must be `VARCHAR2(n CHAR)` (character, not
  byte, semantics) — verify `NLS_CHARACTERSET` is `AL32UTF8` first (Check 2 in
  `00_environment_check.sql`). If it's `WE8MSWIN1252`, Bengali can't be stored — seed in English.
- **Virtual columns** (`GENERATED ALWAYS AS (...) VIRTUAL`) are used for derived fields
  (`TotalAmount`, `AvailableQuantity`, etc.) but must be verified against the actual XE build
  first (Check 5) — fall back to computing in the view/SELECT if they error.
- **XE's bundled APEX occupies port 8080** — Express must run on a different port (5000 planned).
- **Architecture bitness must match everywhere**: XE install (Win32 vs Win64), Instant Client, and
  Node.js all need the same bitness, or Thick-mode init fails with a misleading `DPI-1047`.
- Never develop as `SYS`/`SYSTEM` — use the dedicated `krishichain` app user created by
  `00_environment_check.sql` (`CONNECT, RESOURCE` + `CREATE VIEW/SEQUENCE/TRIGGER/PROCEDURE`).

**Data model shape** (PRD §7/§9, `Phase1/ER_BLUEPRINT.md`): 26 tables (24 core + 2 P2) built
around five graded ER constructs that any schema or query work must preserve:

1. **Total, disjoint specialization** — `USERS` → `FARMER`/`BUYER`/`ADMIN_STAFF`/
   `STORAGE_MANAGER`/`TRANSPORT_PERSONNEL`, using shared-PK subclass tables (subclass PK is also
   FK → `USERS`), not a discriminator column.
2. **Aggregation** — `(BUYER —places— BID —on— HARVEST_BATCH)` as a whole is what `SALE_ORDER`
   relates to, not any one of the three independently (`UQ(BID.SaleOrderID... )` / `UQ(SALE_ORDER.BidID)` enforces 1:1).
3. **Two ternary relationships** — `STORES` (HARVEST_BATCH × STORAGE_UNIT × STORAGE_MANAGER) and
   `ASSIGNED_TO` (TRANSPORT_REQUEST × VEHICLE × TRANSPORT_PERSONNEL). Keep these as single
   junction tables with three FK sets, not decomposed into binary relationships — decomposing
   loses the accountability link (e.g. which manager authorized an allocation).
4. **Two weak entities** — `STORAGE_UNIT` (partial key `UnitNo`, identified by `WarehouseID`) and
   `BAZAR_DAILY_RECORD` (partial key `RecordDate`, identified by `BazarID`); both need
   `ON DELETE CASCADE` from their owning strong entity.
5. **Two recursive relationships** — `VIRTUAL_ARAT.ParentAratID` (ARAT hierarchy, query with
   `CONNECT BY NOCYCLE`) and `BID.PreviousBidID` (outbid chain).

Note: **there is no `AUCTION` entity** — it was deliberately removed (D-4); its bidding-window
attributes (`MinimumPrice`, `BiddingStartTime`, `BiddingEndTime`) live directly on
`HARVEST_BATCH`, and `BID` references the batch directly. Don't reintroduce it.

**Payment model (D-2):** direct buyer → farmer, no ARAT commission, no escrow. **Payment timing
(BR-20)** is only allowed after transport status is `DELIVERED` — this is called out in the PRD as
still-open for confirmation with the team before DDL is written; check before assuming it.

**Six workflows require multi-statement atomic transactions** (PRD §9.10) — always wrap these in
explicit `COMMIT`/`ROLLBACK`, never issue the statements independently: Registration (USERS +
subclass + phone rows), Storage allocation, Place bid (new bid + previous-highest → OUTBID), Award
winning bid (bid → WON + batch → SOLD + sale order + transport request — "the demo centrepiece"),
Assign transport, Delivery + payment.

Use `withTransaction()` from `server/src/config/db.js` for all six — it commits on return and
rolls back on throw. `oracledb.autoCommit` is set to `false` globally there; leave it that way.
Registration (`server/src/services/auth.service.js`) is the implemented reference example.

**Payment triggers are a compound trigger, deliberately.** `trg_payment_biz_rules` enforces BR-19
by summing existing `PAYMENT` rows, which a row-level trigger on `PAYMENT` cannot do —
`ORA-04091: table is mutating`. BR-20 runs in `BEFORE EACH ROW` (it only reads `SALE_ORDER` and
`TRANSPORT_REQUEST`), BR-19 in `AFTER STATEMENT`. Don't "simplify" it back to a plain row trigger.

**Business rules (PRD §8, BR-01..BR-25)** are enforced primarily via DB constraints (CHECK/UNIQUE/
FK), not just application code — e.g. bid must be ≥ batch `MinimumPrice` and > current highest
(BR-11), one `ACTIVE` bid per buyer per batch (BR-14), `MinimumPrice ≥ Crop.BasePrice` (BR-09).
When adding queries or app logic, don't re-implement these as the *only* enforcement — the DB
constraint is expected to be the backstop.

**Naming conventions**: `PK_`, `FK_`, `UQ_`, `CK_`, `IX_` prefixes on all constraints (so
violations are readable during the viva/demo). Index every FK column explicitly — Oracle does not
auto-index them.

**Seed data** (`database/03_insert_data.sql`, already applied): narratively consistent — the same
5 farmers, 5 crops and 7 batches thread through bids → orders → transport → payments. Random or
independent seed rows break the advanced queries (PRD §10) and are called out as the most common
demo failure mode. Six tables exceed "5 rows" on purpose (5 sale orders need 5 finished auctions
upstream; `USERS` is 25 because the specialization is total; `DAILY_MARKET_PRICE` is ~495 so `LAG`
has a real trend). All dates are `TRUNC(SYSDATE) - n`, so the data stays current on re-seed.

Three cross-table rules have **no DB backstop** and the seed satisfies them by hand: BR-09
(`MinimumPrice >= Crop.BasePrice`), BR-11 (bid ≥ minimum and > current highest), BR-18 (vehicle
capacity ≥ load). Check the pairings before editing any price or quantity in the seed file.

**Several seed values exist only to keep the Phase 4 queries non-empty** — changing them
silently breaks `05_advanced_queries.sql`. `DAILY_MARKET_PRICE` covers 12 specific (crop, arat)
series because Q1 joins on the batch's *own* arat; moving a batch to another arat drops that sale
from Q1 unless you add the series. Batch 8 exists solely to give Q4's `NOT EXISTS` anti-join a
batch with no bids. Each crop has its own price amplitude/period/phase/drift so Q5's `LAG` shows
five different trends rather than five identical ones. The seed file comments say which query
depends on what — read them before trimming.

**Seeded users all share the password `Demo@1234`** (real bcrypt hash in the seed). Sign in as
`abdul.karim@krishichain.bd` for a farmer with an open auction and awardable bids.
