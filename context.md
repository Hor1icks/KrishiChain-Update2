# KrishiChain — Working Context

Running log of decisions, phase status, and schema deltas across the project.
`CLAUDE.md` is operating instructions for Claude Code; this file is the project's
memory of *what was decided and why*, kept current as we move through phases.
`KrishiChain_PRD_v3.md` and `Phase1/ER_BLUEPRINT.md` remain the design source of
truth — this file tracks how the implementation has diverged from or resolved
open questions in those documents.

---

## Decisions log

### 2026-08-05 — Phase 1 open questions resolved
Two items PHASE1_README.md left open are now settled:

1. **`PHYSICAL_BAZAR` stays in scope.** Keep both it and its weak entity
   `BAZAR_DAILY_RECORD` — matches the README's own recommendation (it's one of
   the two graded weak-entity constructs).
2. **Payment timing (BR-20) is flexible, not fixed.** The PRD's original BR-20
   assumed payment always happens after delivery. Decision: support **both**
   advance payment and pay-on-delivery — which one applies is an agreement
   between the buyer and farmer, recorded per sale order, not a system-wide rule.

   **Implementation consequence:** `SALE_ORDER` gained a new column,
   `PaymentTerms VARCHAR2(15 CHAR) CHECK IN ('ADVANCE','ON_DELIVERY')`, default
   `'ON_DELIVERY'` (preserves the original PRD behavior unless a party opts into
   advance payment). BR-20 changed from a blanket CHECK to a conditional rule,
   enforced in `trg_payment_biz_rules` (`database/02_sequences_triggers.sql`):
   only blocks payment before delivery when `PaymentTerms = 'ON_DELIVERY'`.

   **This column is not on the ER diagram** (it was decided after the ER was
   finalized). It's a physical-schema addition, not a new conceptual attribute
   the diagram needs to show — but flagging here in case the diagram or schema
   drawing should note it for consistency during the demo/viva.

### 2026-08-05 — Phase 2 executed against live XE, one fix applied
Ran both scripts against the real `krishichain` schema (not just a paper
review). One error surfaced: `REVIEW.Comment` failed with `ORA-00904: invalid
identifier` — **`COMMENT` is an Oracle reserved keyword** (it's the verb in
`COMMENT ON TABLE/COLUMN`), so it can't be used as a bare column name. Renamed
the column to `ReviewComment` in `01_create_tables.sql` and re-ran just that
table; everything else had already created clean on the first pass.

**Diagram delta:** the ER blueprint's `REVIEW.Comment` attribute is
`ReviewComment` in the physical schema. Cosmetic rename only, same attribute.

### 2026-08-05 — Two physical-schema calls made independent of the ER diagram
These are implementation decisions about *how* two derived attributes from the
ER blueprint get realized in the relational schema — not changes to the
conceptual model:

- **`USERS./Age/` is not a stored or virtual column.** Oracle 11g virtual
  (`GENERATED ALWAYS AS`) columns reject non-deterministic expressions, and
  `Age` requires `SYSDATE`. It will be computed in a view instead (planned:
  part of a `V_USER_PROFILE`-style view in Phase 4's `04_views.sql`).
- **Cross-table derived attributes are views, not virtual columns**:
  `HARVEST_BATCH.CurrentHighestBid`, `STORAGE_UNIT.CurrentLoad`,
  `WAREHOUSE.AvailableCapacity` all require aggregating another table, which
  Oracle virtual columns cannot do (same-table expressions only). These map to
  the views already planned in PRD §9.11 (`V_BIDDING_SUMMARY`,
  `V_UNIT_UTILIZATION`).
  Same-table derived attributes (`HARVEST_BATCH.AvailableQuantity`,
  `SALE_ORDER.TotalAmount`) ARE implemented as real virtual columns, per the
  PRD's original plan — those needed no change.

### 2026-08-05 — Phase 3 seed data executed; one real trigger bug found and fixed
`database/03_insert_data.sql` written and run clean against the live schema.
Two things worth recording:

**1. `trg_payment_biz_rules` had a mutating-table bug (fixed).** As originally
written in Phase 2 it was a `BEFORE INSERT ... FOR EACH ROW` trigger on
`PAYMENT` that ran `SELECT SUM(Amount) ... FROM PAYMENT` to enforce BR-19. A
row-level trigger cannot query its own table — Oracle raises `ORA-04091: table
is mutating`. This was invisible in Phase 2 because the trigger compiled fine
and no payment row had ever been inserted; it would have blown up on the first
real payment, i.e. mid-demo.

Rewritten as a **compound trigger**: `BEFORE EACH ROW` does BR-20 (only reads
`SALE_ORDER` and `TRANSPORT_REQUEST`, no mutating table) and collects the
affected `SaleOrderID`s; `AFTER STATEMENT` does BR-19 once `PAYMENT` is
readable. Compound triggers are 11gR1+, so XE 11.2 is fine. Both branches are
verified by negative test (see Phase 3 output below).

**2. Seed rows deliberately exceed "5 per table" in six places.** Five sale
orders require five *finished* auctions upstream, so `HARVEST_BATCH` is 7
(5 sold + 2 left `BIDDING_OPEN` for a live on-screen bid during the demo),
`BID` is 15, `STORES` is 7. `USERS` is 25 because the specialization is total
and disjoint — 5 rows in each of the five subclass tables. `STORAGE_UNIT` is 11
(2 per warehouse + 1 extra whose `UnitNo` is left NULL so `trg_storage_unit_no`
assigns it, proving the partial key is per-warehouse). `DAILY_MARKET_PRICE` is
~495 generated rows, because PRD §15 requires a real multi-month price history
or Q5's `LAG` trend query has nothing to compare against.

**3. Seed dates are all `TRUNC(SYSDATE) - n`, not literals** (except dates of
birth), so the data still reads as current whenever the script is re-run before
the viva. The script is re-runnable: Section 0 clears every table in reverse FK
order, Section 12 re-syncs all 17 sequences past the seeded maximums.

**4. Seed text is English even though the charset is AL32UTF8.** Bengali *is*
storable (confirmed: `NLS_CHARACTERSET = AL32UTF8`), but the risk is client-side
— SQL*Plus on Windows silently turns Bengali into `?` unless `NLS_LANG` is set
to a `.AL32UTF8` value. An optional, commented Bengali `UPDATE` block sits at
the end of `03_insert_data.sql` for demoing `VARCHAR2(n CHAR)` semantics.

### 2026-08-05 — Phase 3 app scaffold: `server/` and `client/` now exist
The PRD's planned project structure (§11.2) is real from here on — `server/`
(Express + node-oracledb Thick mode, port 5000) and `client/` (React + Vite,
port 5173). Decisions worth recording:

- **Vite, not Create React App.** CRA is deprecated. Vite's dev server also
  proxies `/api` → `localhost:5000`, so the browser sees one origin and there
  is no CORS preflight in development.
- **JWT in `localStorage`, bcryptjs for hashing.** `bcryptjs` is pure JS —
  the native `bcrypt` needs a compiler toolchain on Windows, which is not worth
  the setup risk on five machines before a viva.
- **`oracledb.autoCommit = false` globally** (`server/src/config/db.js`), with a
  `withTransaction()` helper. The six PRD §9.10 workflows are all-or-nothing;
  an accidental autoCommit would break atomicity silently.
- **Seeded users cannot log in.** The 25 rows carry placeholder password
  hashes matching no real password. Register a fresh account for any demo that
  needs a session. Both READMEs say so, as does the login page.
- **`.env` gotcha, cost ~10 minutes:** an unquoted `#` starts a comment in a
  `.env` file, so `DB_PASSWORD=Krishi#2026` parsed as `Krishi` and produced
  `ORA-01017`. `.env.example` now quotes it and explains why.

**Registration is the first of the six atomic transactions to be implemented.**
`USERS` → subclass row (PK = the `UserID` just generated, read back with
`RETURNING UserID INTO`) → `USER_PHONE` rows, one commit. Verified by
deliberately failing step 2 with a duplicate NID: the `USERS` row did **not**
persist, and a schema-wide check confirmed no `USERS` row lacks a subclass row.
That invariant — total specialization — is what the transaction exists to
protect.

### 2026-08-05 — Phase 4 SQL: views + advanced queries, and a seed correction
`04_views.sql` and `05_advanced_queries.sql` written and run clean. Writing the
queries exposed that the Phase 3 seed **could not support them**, so the seed
was corrected — this is the PRD §15 "seed data too thin for analytics" risk
landing for real, caught before the demo rather than during it.

**What was wrong, measured not guessed:**
- **Q1 returned 1 row of 5.** Price series existed only for (crop, arat 1) and
  (crops 1–2, arat 4), but batches are listed through arats 2, 3, 4 and 5. Four
  of five sales had no matching market price and silently dropped out of the join.
- **Q2's `RANK()` was meaningless.** Every one of the five farmers lives in a
  different district, so partitioning by district gave every row `Rnk = 1`.
- **Q4's anti-join matched nothing.** All seven batches had bids.
- **Q7 returned zero rows** — every DELIVERED order is fully paid.

**Fixes:**
1. `DAILY_MARKET_PRICE` now generates 12 (crop, arat) series × 90 days = **1,080
   rows** (was 495), covering every arat a batch is actually listed through.
   If a batch moves to a different arat, add the matching series or that sale
   vanishes from Q1.
2. **Q2 partitions by ARAT, not district** — a deliberate deviation from PRD §10,
   noted in the query header. Central Regional Arat serves two farmers, so the
   ranking is a real contest instead of five ties-of-one.
3. **Batch 8 added** (`HARVEST_BATCH` is now 8 rows): LISTED, bidding opens
   tomorrow, deliberately **no bids**, so Q4's anti-join has something to find.
4. **Q3 and Q7 dropped** from the five. Q3 duplicates `V_UNIT_UTILIZATION`;
   Q7 is provably empty against this data.

**Each crop's price now moves differently.** The original generator used one
sine wave scaled by `BasePrice`, which made every crop in Q5 report the *identical*
month-over-month percentage — five crops in perfect lockstep, which reads as
fabricated. Each crop now has its own amplitude, period, phase and drift, chosen
to match real Bangladeshi behaviour: potato drifts down (post-harvest glut),
onion swings hard and spikes +25.7%, lentil climbs steadily.

**One deliberately unflattering row.** Mustard climbs late, so Q1 reports batch
5's sale (74.00 on 26-Jul, against a 77.53 market) as **BELOW MARKET**. Keep it:
it proves Q1 can return a negative verdict rather than only ever congratulating
the platform, and it illustrates the actual risk the system exists to expose —
selling without knowing where the price is heading.

### 2026-08-06 — Farmer module (server + client), and seeded users made loggable
Phase 4's application half. Five pages, seven endpoints, and the second and
third of the six PRD §9.10 transactions.

**Award Winning Bid is implemented and proven atomic.** Five writes in one
transaction: winning `BID` → WON, rival ACTIVE bids → OUTBID, `HARVEST_BATCH` →
SOLD with `SoldQuantity` raised, `INSERT SALE_ORDER`, `INSERT
TRANSPORT_REQUEST`. Two additions beyond the PRD's four-statement list:
- **Rival bids → OUTBID** is folded into the same transaction. Not in the PRD,
  but leaving losing bids ACTIVE after a sale misreports the auction on every
  screen that filters by status.
- **`SELECT ... FOR UPDATE` locks the batch row first.** Two farmers cannot
  award the same batch, but one farmer with two browser tabs can; the lock makes
  the second attempt wait and then fail the already-SOLD guard rather than
  double-selling the crop.

**Verified by fault injection (PRD §13, case T-07).** Added a temporary
`CHECK (SaleOrderID < 0) ENABLE NOVALIDATE` on `TRANSPORT_REQUEST` so the
*last* statement of the award would fail after the other four had succeeded.
Result: bid still ACTIVE, batch still CREATED with `SoldQuantity` 0, sale-order
and transport counts unchanged, and zero `SALE_ORDER` rows without a matching
`TRANSPORT_REQUEST`. Constraint dropped; the same award then succeeded.
(`ENABLE NOVALIDATE` was needed — a plain `ADD CONSTRAINT` fails with
`ORA-02293` because the existing rows violate it.)

**BR-09 and ownership are now enforced for real**, closing two of the three gaps
listed under Open items. `createBatch` rejects a minimum price below the crop's
`BasePrice` (verified: 25.00 against Aman Rice's 32.00 base → 422). Every farmer
endpoint takes the farmer ID from the **verified token, never the URL**, and
cross-farmer access returns **404, not 403** — "that batch exists but is not
yours" leaks the existence of other farmers' rows.

**Seeded users can now log in — password `Demo@1234` for all 25.** They
previously carried placeholder hashes matching no password, which meant the
award screen was unreachable through the UI: the batches with live bids belong
to seeded farmers, and the buyer module (which would let you place new ones)
is Phase 5. `abdul.karim@krishichain.bd` now lands on a farmer with one sold
batch and one open auction. **Note this is local demo seed data** — one shared,
published password across every account is not a pattern to carry anywhere real.

**Re-seeding wipes manually registered accounts.** Section 0 of
`03_insert_data.sql` deletes every row before re-inserting, so the `mofiz`
account registered through the UI on 2026-08-05 is gone. This has always been
true of the seed script; worth knowing before re-running it after doing UI work.

### 2026-08-06 — Buyer module (server + client). The demo loop now closes.
Four pages, five endpoints, and PRD §9.10 transaction #3. With this the core
narrative runs end to end **through the UI alone**: buyer browses → bids →
outbids a rival → farmer awards → sale order and transport request appear on
both sides. Before today a bid could only be created by hand in SQL.

**The auction model, stated once so it is not re-derived:** at most **one** bid
per batch is ACTIVE — the standing highest. Every earlier bid is OUTBID and
points at the one it displaced through `PreviousBidID`. This makes **BR-14**
("one ACTIVE bid per buyer per batch") hold *for free*: if only one bid on the
whole batch is ACTIVE, no buyer can hold two. Verified as a table-wide invariant,
not just on the batch under test.

**BR-11 is now fully enforced**, closing the gap left open on 2026-08-06 above.
The farmer module only checked the floor at award time; Place Bid checks both
halves before a row is ever inserted. All four rejections verified live:
below minimum (19 vs 20), above minimum but below standing (21 vs 22), *equal*
to standing (22 vs 22 — must be strictly higher), and quantity beyond available.

**BR-05 / acceptance case T-05 needs no code.** "A farmer must not bid on their
own batch" is structurally impossible: FARMER and BUYER are disjoint subclasses,
so one person cannot hold both roles and a farmer has no buyer identity to bid
with. The specialization enforces it. Worth saying out loud in the viva.

**Two additions beyond the PRD's three statements**, both inside the same
transaction:
- **`SELECT ... FOR UPDATE` on the batch before reading the standing bid.**
  Without it two buyers bidding at the same instant both read the same "current
  highest", both pass BR-11, and both insert — leaving two ACTIVE bids and a
  broken chain.
- **`LISTED` → `BIDDING_OPEN` promotion on the first bid.** Batches created
  through the farmer module start LISTED; without this they would still read
  LISTED after receiving bids and every status-filtered screen would be wrong.

**Rollback verified by fault injection**, same method as the award transaction:
armed `CHECK (BidPricePerKg < 0) ENABLE NOVALIDATE` on `BID` so the INSERT would
fail *after* the OUTBID update had succeeded. The standing bid stayed ACTIVE.
This is the failure that matters — a non-atomic Place Bid would leave the batch
with **zero** ACTIVE bids, silently killing the auction with no error visible
anywhere.

**One real bug found and fixed: `ORA-00937`.** The dashboard's order-total query
mixed aggregates with a scalar subquery and no `GROUP BY`. Oracle requires every
item in such a select list to itself be an aggregate — a scalar subquery is not
one. Split into two queries and merged in JS. Note `V_FARMER_EARNINGS` uses the
same scalar-subquery-beside-aggregates shape legally, because it *has* a
`GROUP BY` containing the correlating column.

### 2026-08-06 — Real bug found by the user: partial award stranded remaining stock
Reported directly: Abdul Karim's onion batch (3000 kg total) showed 799 kg still
"available" after a 2201 kg bid was awarded, but it could not be bid on as a
buyer or acted on as the farmer — it had silently become unreachable.

**Root cause.** `awardBid()` in `farmer.service.js` set `HARVEST_BATCH.Status =
'SOLD'` unconditionally on every award, regardless of whether the awarded bid's
`RequestedQuantity` covered the whole batch. `BID.RequestedQuantity` is
independent of `HARVEST_BATCH.TotalQuantity` by design — the schema's separate
`TotalQuantity` / `ReservedQuantity` / `SoldQuantity` columns exist specifically
so a batch can be sold off across more than one award. Once a batch reads SOLD:
`V_BIDDING_SUMMARY.BiddingState` maps it to `'CLOSED - SOLD'`, so it drops out
of the buyer's Browse Listings entirely, and the farmer's Batch Detail page
hides the Accept action — the leftover kg had nowhere to go from either side.

**Fix.** The award's batch UPDATE now closes the batch only when the math says
so: `Status = CASE WHEN TotalQuantity - ReservedQuantity - (SoldQuantity + :qty)
<= 0 THEN 'SOLD' ELSE Status END`. A partial award leaves the batch exactly as
it was (`BIDDING_OPEN`), so `placeBid()`'s existing SOLD/DELIVERED/EXPIRED guard
naturally keeps accepting bids on the remainder — no other code needed changing.
The response now also returns `remainingQuantity` and `batchFullySold` so the UI
can say "799 kg still open" instead of implying the batch is done.

**Two live rows were already corrupted and needed data repair, not just a code
fix** — batch 6 (2500 kg stranded, seed's own live-demo batch, corrupted by my
own testing of the award transaction) and batch 16 (799 kg stranded, created
and bid on by the user testing the app themselves). Both had bidding windows
still genuinely open (through 2026-08-10 and 2026-08-13). Repaired with:
```sql
UPDATE HARVEST_BATCH SET Status = 'BIDDING_OPEN'
 WHERE Status = 'SOLD' AND AvailableQuantity > 0
   AND BiddingEndTime IS NOT NULL AND CAST(BiddingEndTime AS DATE) >= SYSDATE;
```
That condition is deliberately narrow so it cannot touch the five *intentionally*
historical seed batches (1-5), which also show `SOLD` with leftover quantity but
whose bidding windows closed months ago in the seed's own narrative — those are
supposed to look finished, and were left untouched. Verified after repair: the
existing sale orders (#15, #16) and their transport requests were unaffected —
only `HARVEST_BATCH.Status` changed.

**Lesson for future award/allocation-style transactions**: whenever a table has
separate total/reserved/consumed quantity columns, closing a status flag out
needs to check the arithmetic, not just fire on "an action of this type
happened." The same shape of bug is worth checking for BR-18 (vehicle capacity
vs. load) and storage allocation when those are built.

### 2026-08-06 — Storage module (server + client). PRD §9.10 transaction #2.
Three pages, nine endpoints. Four of the six atomic transactions now exist.

**BR-07 is the rule this transaction exists to protect** — an allocation must
never push a unit's load past its capacity, and must roll back if it would
(PRD acceptance case T-03). Enforced in `allocate()`, verified live: 9000 kg
into a 5000 kg unit rejected; 2500 kg into a unit with 2000 kg free rejected
with the actual numbers in the message.

**BR-08 is enforced by the database, not by code.** `UQ_STORES_ALLOCATION` is
`(BatchID, WarehouseID, UnitNo, DateIn)`, so `DateIn` is written as
`TRUNC(SYSDATE)`, not `SYSDATE` — at timestamp precision the constraint would
essentially never fire and the rule would be decorative. The service catches
that specific constraint name and translates it into a readable message.
Verified by allocating a batch, releasing it, and re-allocating it to the same
unit the same day → rejected.

**Unit status is recomputed from actual load, never assumed.**
`refreshUnitStatus()` re-derives EMPTY/PARTIAL/FULL from the sum of open
`STORES` rows after every allocation *and* every release, so
`STORAGE_UNIT.Status` cannot drift away from the rows underneath it. MAINTENANCE
is deliberately left alone — it is a human decision about the unit, not a
function of how full it is. Verified as a table-wide invariant.

**Adding a unit does not send a UnitNo.** `STORAGE_UNIT` is the weak entity
whose partial key restarts at 1 per warehouse; `trg_storage_unit_no` computes
it and `RETURNING` reads back what the trigger assigned. Passing a UnitNo from
the client would bypass the trigger and let warehouses drift out of their own
numbering. The UI surfaces the assigned number explicitly — it is one of the
clearest live demos of the weak-entity construct.

**Two guards beyond the PRD's three statements:**
- **`SELECT ... FOR UPDATE` on the unit before measuring its load.** Without it
  two managers allocating into the same unit simultaneously both read the same
  "current load", both pass BR-07, and together overfill it.
- **Batch status is promoted to STORED only from CREATED.** A batch already
  LISTED or BIDDING_OPEN keeps its status — overwriting it with STORED would
  pull a live auction out of the buyer's listings mid-bid. (Same class of bug as
  the partial-award one found earlier today: never set a status flag
  unconditionally just because an action of that type occurred.)

**Release is included even though PRD §11.3 defers "allocation history".** The
action itself belongs here — without it a unit only ever fills up and the
utilisation view could never come back down. Uses `TRUNC(SYSDATE)` for DateOut
so same-day releases satisfy `CK_STORES_DATES` (DateOut >= DateIn).

**Rollback verified by fault injection**, same method as the other three:
armed `CHECK (Status <> 'PARTIAL') ENABLE NOVALIDATE` on `STORAGE_UNIT` so the
status update would fail *after* the `STORES` insert succeeded. No orphan
allocation row, unit untouched.

---

### 2026-08-07 — Transport + admin modules. All six transactions exist; every page is built.

The front end is complete against PRD §11.3: 28 of 28 pages, no `ready: false`
entries left in the navigation.

**Transaction #5 (Assign transport) and #6 (Delivery + payment) are done**, so
all six of PRD §9.10 now exist and all six are fault-injection verified.

**Who assigns transport was an open question — personnel self-claim.** The PRD
names no dispatcher role and §11.3 gives TRANSPORT_PERSONNEL "My Assignments",
so a driver takes an open request and picks a vehicle in one act. That keeps
`ASSIGNED_TO` (request × vehicle × personnel) honest: all three legs of the
ternary are decided together by the person accountable for the trip.

**BR-18 is now enforced** in `transport.service.js` `claim()` — the last of the
three rules that had no database backstop. It compares `VEHICLE.Capacity`
against a quantity two joins away in `SALE_ORDER`, which is why it could not be
a CHECK constraint. Verified live: a 2500 kg order against a 100 kg vehicle was
rejected with both numbers in the message.

**Transaction #6 is the driver's action, not the buyer's, and that is
deliberate.** `PaymentTerms = 'ON_DELIVERY'` is cash on delivery — the money
changes hands at the doorstep, which is the same moment the trip is marked
delivered. So the PRD's three statements really are one atomic act. The payment
is still recorded buyer → farmer (D-2); the driver only witnesses it. ADVANCE
orders are paid earlier through `buyer.service.js` `payOrder()`, and for those
#6 records the delivery without inserting a second PAYMENT row.

**Statement order inside #6 matters and must not be "tidied".**
`TRANSPORT_REQUEST → DELIVERED` is written *before* the PAYMENT insert, because
`trg_payment_biz_rules` reads `TRANSPORT_REQUEST` to enforce BR-20 and inside
one transaction it sees the uncommitted value. Swapping those two lines makes
every on-delivery payment fail with ORA-20002.

**Both rollbacks proven by fault injection**, same method as the other four:
- #5 — armed `CHECK (DeliveryStatus <> 'ASSIGNED') ENABLE NOVALIDATE` on
  `TRANSPORT_REQUEST` so the final statement failed. Zero orphan `ASSIGNED_TO`
  rows, vehicle still AVAILABLE, trip still PENDING.
- #6 — armed `CHECK (Status <> 'AVAILABLE') ENABLE NOVALIDATE` on `VEHICLE` so
  the vehicle release failed *after* the PAYMENT insert. No payment row, trip
  still ASSIGNED, order still CONFIRMED, assignment still ACTIVE.

**A real seed/schema drift was found and fixed.** `01_create_tables.sql` had
been updated with the storage-consent workflow but `03_insert_data.sql` had
not: its `STORES` rows still used the pre-workflow column list and set neither
`RequestedByFarmerID` nor `RequestedByBuyerID`, so **all 7 rows were rejected by
`CK_STORES_CUSTOMER` on any fresh database** and the storage module came up
empty. `WAREHOUSE.StorageFeePerKgRate` was NULL for all five as well, which the
storage service reads. Both fixed in the seed; the 7 allocations are leg 1, so
the consenting customer is the farmer who owns the batch.

**`ORA-01745` from a bind variable named `:comment`.** `COMMENT` is an Oracle
reserved word, so the *bind name itself* is illegal — the statement fails before
it runs, and the error names neither the column nor the word. Renamed to
`:reviewComment`. Worth remembering: bind names are parsed as identifiers.

**Admin writes nothing that participants own.** Reference data
(`DAILY_MARKET_PRICE`) and complaint status only. Nothing in `admin.service.js`
touches BID, SALE_ORDER or PAYMENT — an admin who could rewrite a sale would
make the audit trail meaningless. Complaint triage stamps `HandledByAdminID`,
which nothing else writes.

---

## Phase status

| Phase | Deliverable | Status |
|---|---|---|
| 1 (Day 0-1) | Environment proof + ER diagram | **Done** (user-drawn, per `Phase1/ER_BLUEPRINT.md`) |
| 2 (Day 2) | `01_create_tables.sql` + `02_sequences_triggers.sql` | **Done and verified** — executed clean against live XE 11.2 |
| 3 (Day 3) | `03_insert_data.sql` + React/auth scaffold | **Done and verified** — seed data + `server/` and `client/` running end to end |
| 4 (Day 4) | `04_views.sql`, `05_advanced_queries.sql`, Express wiring, farmer pages | **Done and verified** — views, 5 queries, farmer module server + client |
| 5 (Day 5) | Buyer, storage, transport pages | **Done and verified** — buyer, storage and transport modules all live |
| 6 (Day 6) | Admin pages, navigation wiring, narration script | **Pages + navigation done and verified**; narration script not written |
| 7 (Day 7) | Full dry run, screenshots, submission pack | Not started |

**Phase 2 output, verified against the live `krishichain` schema on 2026-08-05:**
- `database/01_create_tables.sql` — all 26 tables (24 core + PHYSICAL_BAZAR +
  BAZAR_DAILY_RECORD) created; confirmed via `user_tables` (count = 26).
  Named PK/FK/UQ/CK constraints, FK-column indexes plus the composite indexes
  called out in PRD §9.9 (28 indexes, all created clean).
- `database/02_sequences_triggers.sql` — 17 sequences (`user_sequences` count
  = 17) and 19 triggers (`user_triggers` count = 19: 17 ID-generation pairs +
  `trg_storage_unit_no` + `trg_payment_biz_rules`). Confirmed zero `INVALID`
  objects via `user_objects`.

Both scripts now run clean start-to-finish on an empty schema — Day 2's
definition of done is met. Phase 3 (seed data) is unblocked.

**Phase 3 output, verified against the live `krishichain` schema on 2026-08-05:**
`database/03_insert_data.sql` runs clean (zero `ORA-` errors) and is
idempotent — it was run three times in a row during verification.

Seeded rows: USERS 25, USER_PHONE 29, FARMER/BUYER/ADMIN_STAFF/
STORAGE_MANAGER/TRANSPORT_PERSONNEL 5 each, CROP_CATEGORY 5, CROP 5, FARM 5,
VIRTUAL_ARAT 5, HARVEST_BATCH 7, WAREHOUSE 5, STORAGE_UNIT 11, STORES 7,
BID 15, SALE_ORDER 5, PAYMENT 5, VEHICLE 5, TRANSPORT_REQUEST 5,
ASSIGNED_TO 5, DAILY_MARKET_PRICE 495, PHYSICAL_BAZAR 5,
BAZAR_DAILY_RECORD 8, REVIEW 5, COMPLAINT 5.

Graded ER constructs confirmed live, not just on paper:
- **Specialization** — 25 USERS rows, 25 subclass rows, total and disjoint.
- **Virtual columns** — `AvailableQuantity` and `TotalAmount` computed by
  Oracle itself (e.g. SO 2 = 1500 × 102.50 = 153,750).
- **Recursive #1** — `CONNECT BY NOCYCLE` returns a genuine 3-level ARAT tree.
- **Recursive #2** — 7 outbid chains, one of them 3 bids deep.
- **Weak entity** — `trg_storage_unit_no` assigned unit 3 in warehouse 1 from a
  NULL `UnitNo`, confirming per-warehouse (not global) numbering.

Business rules verified by **negative test** (each attempted, each rejected,
then rolled back):
- BR-20 — paying `SALE_ORDER` 5 (ON_DELIVERY, transport still `ASSIGNED`)
  raised `ORA-20002`. Paying order 2 (ADVANCE) pre-delivery succeeded, which is
  the flexible-payment decision working as intended.
- BR-19 — overpaying order 4 by 30,000 against a 25,750 balance raised
  `ORA-20001`; settling it at exactly 25,750 succeeded.
- BR-11 — a bid of 5.00 on a batch with `MinimumPrice` 20.00 **succeeded**, as
  expected. This is the documented gap: BR-11 has no DB backstop and is Phase 4
  service-layer work. Same for BR-09 and BR-18 (the seed satisfies both by hand).

**Phase 3 app scaffold, verified running on 2026-08-05:**
- `server/` — Express on :5000, Oracle pool in Thick mode. Endpoints live and
  tested: `GET /api/health` (round-trips a query), `GET /api/auth/roles`,
  `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
  Registration, login, `/me` (with computed `age`), 401 on bad credentials and
  404 on unknown routes all confirmed against the live database.
- `client/` — React + Vite on :5173. `npm run build` clean. Login, Register
  (role-driven fields, repeatable phone inputs) and a role-aware Dashboard,
  with `ProtectedRoute` for the role-based navigation Phases 4-6 need.
- Full stack confirmed through the Vite proxy: registered a buyer at
  `localhost:5173/api/...`, logged in, fetched the profile. Both API test users
  were deleted afterwards — `USERS` is back to the seeded 25.

Day 3 is complete.

**Phase 4 SQL output, verified against the live schema on 2026-08-05:**
- `database/04_views.sql` — all six PRD §9.11 views created, all `VALID`, all
  returning rows: `V_USER_PROFILE` (25), `V_BATCH_AVAILABILITY` (8),
  `V_UNIT_UTILIZATION` (11), `V_BIDDING_SUMMARY` (8), `V_FARMER_EARNINGS` (5),
  `V_PENDING_DELIVERY` (2). These carry the four derived attributes that could
  not be virtual columns — `Age`, `CurrentHighestBid`, `CurrentLoad`,
  `AvailableCapacity` — closing the gap flagged in the 2026-08-05 entry above.
  `V_PRICE_COMPARISON` from the PRD list was **not** built as a standing view:
  nothing but Q1 needs it, so its logic lives in Q1 directly rather than adding
  a seventh view to defend in the viva.
- `database/05_advanced_queries.sql` — five queries, zero errors, **every one
  returns rows**, satisfying PRD §16's "5 advanced queries returning non-empty,
  explainable results". Q1 price transparency (4 BEAT MARKET, 1 BELOW),
  Q2 `RANK()` per ARAT (5 rows, one genuine 2-way contest), Q4 competitiveness
  + anti-join (3 crops above average, 1 batch with no bids), Q5 `LAG()`
  month-over-month (20 rows, each crop trending differently), Q6 `CONNECT BY
  NOCYCLE` hierarchy rollup (5 rows, 3 tiers).
- No `FETCH FIRST` anywhere — top-n-per-group uses `RANK()` filtered in an outer
  query, which is 11g-safe and the better answer in a viva regardless.

Remaining for Phase 4: Express role modules and the farmer pages.

---

## Enforcement layer map

Which layer enforces which business rule (PRD §8), so this isn't re-derived
every phase:

- **DB constraint (CHECK/UNIQUE/PK/FK)** — BR-01, 05 (partially), 06, 08, 10,
  16, 19*, 20*, 21, 22, 23, 24. (*BR-19/20 via trigger, not plain CHECK —
  cross-table.)
- **App/service layer, inside the PRD §9.10 atomic transactions** — BR-02,
  03, 04, 07, 09, 11, 12, 13, 14, 15, 17, 18, 25. These need either the
  current user's identity/role (ownership checks) or a value from another
  table combined with a multi-statement transaction the DB layer alone
  shouldn't own. Deliberately not duplicated as DB triggers to avoid two
  sources of truth diverging — Phase 4 implements these.

---

## Storage negotiation and the transport delivery gate (2026-08-13)

Three changes shipped together because they all touch the storage accept path.
Schema in `database/07_bid_storage_transport_notifications.sql`.

**Negotiation is a single counter-offer round.** `STORES.ProposedBy` records
which side opened an allocation ('MANAGER' or 'CUSTOMER'), and that decides who
may answer it — `assertIsResponder()` derives the responder rather than trusting
the caller. Whoever answers may ACCEPT, REJECT, or COUNTER once; a COUNTER sets
`AllocationStatus='COUNTERED'` plus `CounterRatePerKg`/`CounteredBy`, and only
the *original proposer* may then accept or reject it. There is deliberately no
re-counter: `respondToCounter()` refuses anyone but the proposer, so no sequence
of API calls can bounce a negotiation back and forth forever.

`'COUNTERED'` had to be added to every "this space is spoken for" status list —
`unitLoad()`, `LEG1_BASE_SQL`, `LEG2_BASE_SQL`, `propose()`'s subqueries and
`V_UNIT_UTILIZATION`. An allocation mid-negotiation still reserves its unit
space; without this a second manager could double-book the same unit while the
first negotiation was open.

**Acceptance happens in exactly one function.** `finalizeAcceptance()` is
reached from three paths (plain accept, accepted counter, manager accepting a
customer request) and is the only place that writes `ACTIVE`/`DateIn`, promotes
a leg-1 batch `CREATED`→`STORED`, and unlocks leg-2 transport. It also writes
the agreed rate into `StorageFeePerKgSnapshot`, which re-derives the virtual
`StorageFee` — that is how a countered rate becomes the real fee.

**THE TRANSPORT DELIVERY GATE — this changes the demo flow.** Awarding a bid
still raises a `TRANSPORT_REQUEST` immediately, but at that moment nobody knows
where the load is going. `SALE_ORDER.DeliveryPreference` starts `'PENDING'` and
the request is **not offered to drivers** until it leaves that state, by exactly
two routes:

1. the buyer picks direct delivery (`buyer.service.js setDeliveryDirect()`), or
2. a leg-2 storage allocation reaches ACTIVE (`finalizeAcceptance()`).

Both also write the real `TRANSPORT_REQUEST.DeliveryLocation` — the buyer's
address or the warehouse's. Enforced in `listOpenRequests()`'s WHERE clause and
re-checked inside `claim()`, because those two calls are not atomic with each
other (a different reason from BR-18's recheck, which exists because the vehicle
isn't known until claim time).

**Consequence for the narration script:** "Award Winning Bid" no longer produces
a claimable trip on its own. The script needs an explicit step between award and
transport-claim — buyer chooses direct delivery, or accepts a storage proposal.
The seeded data is unaffected: all 5 seeded sale orders are backfilled to
`'DIRECT'`, so the seeded transport rows stay claimable exactly as before.

Fault-injection verified (2026-08-13): a temporary
`CHECK (DeliveryPreference <> 'VIA_STORAGE') ENABLE NOVALIDATE` armed against
`SALE_ORDER`, then a leg-2 accept — the `STORES` row stayed `PENDING_ACCEPT`
with `DateIn` null, the unit's status was untouched, and the order stayed
`PENDING`. Dropped, retried, succeeded.

---

## PL/SQL layer (2026-08-13)

`database/08_plsql_layer.sql` — the stored procedures, functions and
packages the project proposal (§4) commits to. Run after `04_views.sql`;
every object is `CREATE OR REPLACE`, so it is safe to re-run, and a
re-seed does not invalidate it (wiping rows does not drop packages).

**What is in it**

- `pkg_krishi_metrics` — five functions returning derived scalars:
  `fn_order_outstanding`, `fn_unit_free_space`, `fn_batch_unstored`,
  `fn_storage_days`, `fn_farmer_revenue`.
- `pkg_krishi_reports` — the six reports from the proposal's Reporting
  Module (harvest, storage, sales, payment, market price, user activity),
  each an `OUT SYS_REFCURSOR` procedure.
- `prc_expire_stale_batches` — housekeeping DML: retires an auction whose
  window closed with no bid and nothing sold. Explicit cursor +
  `WHERE CURRENT OF`, `FOR UPDATE` so a bid landing mid-run cannot be
  lost, and the caller owns the COMMIT (composable with `withTransaction()`).

**What is deliberately NOT in it — read before adding to this file.**
The six PRD §9.10 transactions stay in the Express service layer. Each
needs the authenticated user's identity and role to decide what is
allowed, which the database has no concept of, and each is fault-injection
verified in that form. Re-expressing them as procedures would create two
sources of truth for the same business rules — exactly what the "which
layer enforces which rule" table above rules out. Where a **view** already
owns a derivation, the functions read the view (`fn_unit_free_space`
reads `V_UNIT_UTILIZATION`) rather than re-deriving it, for the same
reason.

**Wired into the app, not decorative.** `GET /api/admin/reports` lists
them; `GET /api/admin/reports/:name` runs one. `callCursor()` in
`server/src/config/db.js` is the only way to call them — it drains the
ref cursor **in batches** and closes it explicitly. Both matter: a single
capped `getRows(n)` silently returns the first n rows (this actually bit
during development — the market-price report quietly reported 200 rows
instead of 372), and an unclosed ref cursor holds a server-side cursor
open until `OPEN_CURSORS` is exhausted.

**Bind-name trap, again:** the activity report's row cap binds as
`:maxRows`, not `:limit` — `LIMIT` is reserved and fails at parse time
with `ORA-01745`, naming neither the column nor the offending word. Same
class of bug as `:comment`.

---

## ER diagram corrections (2026-08-16)

`ER/krishichain-er-solution.html` was regenerated against the live schema.
Backup of the previous version sits beside it as `.bak`.

**Two real defects fixed:**

- **REVIEW hung off PAYMENT.** The `has` connector started at PAYMENT's
  bottom edge; a review is written against the *order*
  (`REVIEW.SaleOrderID`, UNIQUE → 1:1), never against a payment. Re-parented
  to SALE_ORDER.
- **`raised on` never reached its diamond** — the COMPLAINT connector stopped
  at (1790, 2062) while the diamond spans x 1638–1762. Pre-existing, unrelated
  to the above; now joined.

**One notation fix:** `settled by` ran diamond-to-diamond off the STORES
ternary, which Chen notation does not permit — a relationship cannot
participate in another relationship. STORES is now wrapped in a dashed
**aggregation box** and `settled by` leaves the box, matching the treatment
the BID/SALE_ORDER aggregation already had. This is the diagram catching up
with the physical model: STORES has its own surrogate key (`AllocationID`),
which is exactly what makes it referenceable as one fact.

**Brought up to date with Phases A–C:** NOTIFICATION entity + `notifies`
added to both diagrams (it was missing entirely), plus `STORES.ProposedBy`,
`CounterRatePerKg`, `CounteredBy`, `HARVEST_BATCH.MinimumBidQuantity` and
`SALE_ORDER.DeliveryPreference`.

There are now **two aggregations**, and the intro, mapping notes and
assumptions all say so.

---

## Open items

- Decide whether `SALE_ORDER.PaymentTerms` should be surfaced on the ER/schema
  diagrams for the report, or documented as a physical-only addition.
- **The narration script now needs a delivery-choice step** between award and
  transport claim (see the transport delivery gate above).
- **BR-09 is now enforced** in `farmer.service.js` `createBatch()` (2026-08-06).
- **BR-11 is now fully enforced** in `buyer.service.js` `placeBid()` (2026-08-06),
  both halves, plus the floor re-checked at award time.
- **BR-18 is now enforced** in `transport.service.js` `claim()` (2026-08-07).
  All three of the rules that lacked a database backstop are now covered in the
  service layer.
- The seed satisfies all three by hand regardless; **check the crop `BasePrice` /
  batch `MinimumPrice` pairing before editing any price in
  `03_insert_data.sql`.**
- Narration script (PRD §11.3) is the last thing outstanding before the dry run.

---

## Post-Update-1 assessment fixes (database/09, database/10)

Both migration files are re-runnable and have been applied to the live schema.
The whole chain `00_reset` → `01` → `02` → `03` → `04` → `08` → `05` rebuilds
from an empty schema with **zero errors**.

### D-9  STORAGE_PAYMENT merged into PAYMENT (discriminator)

The evaluator questioned one PAYMENT touching both a farmer and a storage
allocation. He offered two fixes: specialize PAYMENT, or make FarmerID
nullable. We took the discriminator form of the first:

    PaymentType IN ('SALE','STORAGE')
    SALE     -> SaleOrderID + BuyerID + FarmerID set, AllocationID null
    STORAGE  -> AllocationID set, the other three null

`CK_PAYMENT_TYPE_SHAPE` enforces the shape, so the nullable columns cannot be
filled in nonsensically. Verified: a STORAGE row carrying a SaleOrderID, a SALE
row missing FarmerID, and an unknown PaymentType are all rejected (ORA-02290);
a well-formed STORAGE row is accepted.

**Why a discriminator here but subclass tables for USERS.** The USERS subtypes
each carry several attributes of their own and earn a table. These two differ
by one or two columns, so a discriminator is proportionate. Be ready to say
this - the inconsistency is the obvious follow-up question.

The second aggregation survives: `PAYMENT.AllocationID` still references the
STORES allocation as a whole.

### D-10  USERS.Address is an abstract data type

The six flat address columns became one `Address t_address` object column with
`full_text()` and `short_text()` member functions. The type knows how to format
itself, so `V_USER_PROFILE.FullAddress` is now `u.Address.full_text()` rather
than the same NVL2 chain repeated in every query that needs it.

Two gotchas, both hit during implementation:
- Attribute access needs a table alias. `u.Address.District` works,
  `Address.District` does not.
- `NVL2` is a SQL function and is unavailable inside PL/SQL (PLS-00201), so the
  member bodies use CASE.

node-oracledb 6.9 Thick mode round-trips the type against XE 11.2 correctly -
reads come back as a DbObject, writes bind via `getDbObjectClass()`. This was
proven with a throwaway spike before any migration was written.

### D-11  ON DELETE rules

20 CASCADE, 3 SET NULL, 18 left restricting. The 18 are deliberate: reference
data (CROP, VIRTUAL_ARAT) and accountability links (the manager who authorised
an allocation, the payer on a payment). Deleting a crop that has sales history
raises ORA-02292 on FK_BATCH_CROP, which is the correct outcome and a good
thing to demonstrate.

### Answers the viva got wrong (no code change needed)

- **SALE_ORDER -> TRANSPORT_REQUEST is 1:1, not 1:M.** One order raises one
  transport request; the multiplicity is further down, one request to many
  VEHICLES through ASSIGNED_TO. `UQ_TRANSPORT_ORDER` is therefore correct.
- **The FK direction was already right.** SaleOrderID sits on
  TRANSPORT_REQUEST, the many side. It was answered backwards on the day.
- **There is no GENERATES table** and never was.
- **Auto-increment**: Oracle 11g has no IDENTITY column. The 18 sequences
  paired with BEFORE INSERT triggers *are* the 11g equivalent. Nothing to add.
