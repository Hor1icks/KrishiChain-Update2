# Changes since the Project Update-1 assessment

Everything below is applied to the live database and running in the app.
This is the list to review, test and pick holes in.

**Accounts** — every seeded user has the password `Demo@1234`.

| Role | Email |
|---|---|
| Farmer | `abdul.karim@krishichain.bd` |
| Buyer | `tanvir.hossain@krishichain.bd` |
| Storage manager | `ashraful.alam@krishichain.bd` |
| Transport | `sohel.rana@krishichain.bd`, `rafiqul.sheikh@krishichain.bd` |
| Admin | `farhana.yasmin@krishichain.bd` |

**Running it**

```bash
cd server && npm install && npm start     # http://localhost:5000
cd client && npm install && npm run dev   # http://localhost:5173
```

If the API dies with `DPI-1047`, the Instant Client is not on the library
path. Start it with:

```bash
cd server
LD_LIBRARY_PATH=/home/mushy/oracle/instantclient_19_26 node src/server.js
```

---

## Part 1 — what the evaluator raised

### 1.1 STORAGE_MANAGER had only one attribute of its own

It held only `EmployeeID`, which is not enough to justify a separate
subclass table (compare FARMER with 4 and BUYER with 3).

Added `Designation`, `HireDate`, `ShiftSchedule`, `CertificationNo`.

**Check it**

```sql
SELECT * FROM STORAGE_MANAGER;
```

### 1.2 STORAGE_PAYMENT merged into PAYMENT

He questioned one PAYMENT touching both a farmer and a storage
allocation, and offered two fixes: specialize PAYMENT, or make FarmerID
nullable. We took the discriminator form.

`PAYMENT` now has `PaymentType IN ('SALE','STORAGE')`. `SaleOrderID`,
`BuyerID` and `FarmerID` are nullable; `AllocationID` was added.
`STORAGE_PAYMENT` is gone, its 5 rows migrated.

`CK_PAYMENT_TYPE_SHAPE` is what makes the nullable columns safe: it
enforces that a SALE row carries an order, a buyer and a farmer, and a
STORAGE row carries an allocation and none of those.

**Expected question:** why a discriminator here, when USERS uses
shared-PK subclass tables? Because the USERS subtypes each carry several
attributes of their own and earn a table, whereas these two differ by
one or two columns.

The aggregation construct survives: `PAYMENT.AllocationID` still
references the STORES allocation as a whole.

**Check it**

```sql
SELECT PaymentType, COUNT(*) FROM PAYMENT GROUP BY PaymentType;

-- each of these must be rejected with ORA-02290
INSERT INTO PAYMENT (PaymentType, AllocationID, SaleOrderID, Amount, PaymentMethod, TransactionReference)
VALUES ('STORAGE', 1, 1, 100, 'CASH', 'TEST1');

INSERT INTO PAYMENT (PaymentType, SaleOrderID, BuyerID, Amount, PaymentMethod, TransactionReference)
VALUES ('SALE', 1, 6, 100, 'CASH', 'TEST2');

-- this one must succeed
INSERT INTO PAYMENT (PaymentType, AllocationID, Amount, PaymentMethod, TransactionReference)
VALUES ('STORAGE', 1, 100, 'CASH', 'TEST3');
ROLLBACK;
```

### 1.3 Farmer to payment was drawn 1:1

The DDL was already 1:M and the seed already has two instalments on sale
order 4. Only the ER diagram was wrong, so this is a diagram fix
(being done on paper).

```sql
SELECT SaleOrderID, COUNT(*) FROM PAYMENT
WHERE PaymentType = 'SALE' GROUP BY SaleOrderID ORDER BY SaleOrderID;
```

### 1.4 ON DELETE was missing on 38 of 41 foreign keys

Now 20 `CASCADE`, 3 `SET NULL`, 18 left restricting on purpose.

The 18 are the point, not an oversight: reference data (CROP,
VIRTUAL_ARAT) and accountability links (the manager who authorised an
allocation, the payer on a payment). Deleting a crop that has sales
history *should* fail.

**Check it**

```sql
SELECT delete_rule, COUNT(*) FROM user_constraints
WHERE constraint_type = 'R' GROUP BY delete_rule;

DELETE FROM CROP WHERE CropID = 1;   -- ORA-02292, correctly refused
```

Cascade going the other way, through the app: register a throwaway
farmer, then `DELETE FROM USERS WHERE UserID = <new id>` and check the
FARMER and USER_PHONE rows went with it.

### 1.5 Answers that were wrong on the day (no code change needed)

- **SALE_ORDER to TRANSPORT_REQUEST is 1:1**, not 1:M. One order raises
  one request. The multiplicity is further down: one request, many
  vehicles. `UQ_TRANSPORT_ORDER` was correct all along.
- **The FK direction was already right.** `SaleOrderID` sits on
  `TRANSPORT_REQUEST`, the many side.
- **There is no `GENERATES` table** and there never was.
- **Auto-increment:** Oracle 11g has no `IDENTITY` column. The 18
  sequences paired with `BEFORE INSERT` triggers *are* the 11g
  equivalent. Nothing was missing.

### 1.6 Sequences and indexes

`database/11_sequence_index_demo.sql` is a read-only script that proves
both. It prints `trg_payment_id` in full, then runs the same query twice
with an index created in between:

```
BEFORE:  TABLE ACCESS FULL          DAILY_MARKET_PRICE
AFTER:   TABLE ACCESS BY INDEX ROWID DAILY_MARKET_PRICE
           INDEX RANGE SCAN          IX_DEMO_PRICE
```

It drops the throwaway sequence and index at the end, so it is safe to
run repeatedly.

---

## Part 2 — the transport model

**One sale order raises one transport request. That request belongs to
exactly one transport person, who may then spread the load across as
many of their own vehicles as it takes. Two people never share a
request.**

This was wrong before in two ways. The capacity check compared the whole
order against a *single* vehicle, so a 10,000 kg order could never be
assigned two 6,000 kg trucks. And nothing stopped two different people
attaching vehicles to the same request.

Now:

- capacity is checked across the fleet on the request, not per vehicle
- a request stays `PENDING` while its assigned capacity is short, so the
  same operator can keep adding vehicles
- it flips to `ASSIGNED` only once the fleet covers the load
- `UQ_ASSIGNED_VEHICLE (TransportID, VehicleID)` stops the same vehicle
  appearing twice
- `trg_assigned_one_personnel` stops a second person joining
- completing a trip now releases **all** the vehicles, not just one

**Check it in the app**

Log in as `sohel.rana@` or `rafiqul.sheikh@`. Trip 3 carries 6,000 kg on
two vehicles under one operator, shown as *"+ 1 more · 8000 kg total"*.

To watch it happen live:

```bash
./db.sh database/demo_multivehicle.sql
```

That leaves request 4 (3,000 kg) unclaimed with only two small vehicles
available. Then as `sohel.rana@`:

1. claim with **BOGURA-TA-14-3456** (2,500 kg) — succeeds, stays PENDING
2. as `rafiqul.sheikh@`, try to claim the same request — refused
3. back as `sohel.rana@`, add **DHK-METRO-TA-13-9012** (3,000 kg) —
   fleet reaches 5,500 and the request flips to ASSIGNED

Restore with `./db.sh database/03_insert_data.sql`.

**Check the database refuses it too**

```sql
INSERT INTO ASSIGNED_TO (TransportID, VehicleID, PersonnelID, AssignmentStatus)
VALUES (3, 1, 22, 'ACTIVE');   -- ORA-20004, one request one person
ROLLBACK;

SELECT TransportID, COUNT(*) AS vehicles, COUNT(DISTINCT PersonnelID) AS people
FROM ASSIGNED_TO GROUP BY TransportID ORDER BY TransportID;
```

`people` must be 1 on every row.

---

## Part 3 — what Update-2 asks for

Seven techniques, all reachable from the front end.

| Technique | Where it is | How to see it |
|---|---|---|
| View | 6 views, 5 feed pages | Farmer dashboard, storage units, user profile |
| PL/SQL | 2 packages, 7 procedures | Admin → Reports |
| Cursor | ref cursor in all 6 reports | Admin → Reports |
| Function | 5 functions | five pages, listed below |
| Subquery | throughout the services | Admin → Reports, storage pages |
| Exception handling | trigger errors + constraint errors | see 3.3 |
| Abstract datatype | `t_address` on USERS | see 3.4 |

### 3.1 Admin → Reports (new page)

`/admin/reports`. Six reports behind a picker, each a PL/SQL procedure
returning a ref cursor. Row counts on the seeded data:

| Report | Rows |
|---|---|
| Harvest | 8 |
| Storage | 7 |
| Sales | 5 |
| Payment | 5 |
| Market price | 372 |
| User activity | 41 |

Filters pass through to the procedure — try a date range on Sales.

### 3.2 PL/SQL functions on existing pages

| Function | Page | Value on seed data |
|---|---|---|
| `fn_farmer_revenue` | Farmer dashboard | 144000 |
| `fn_order_outstanding` | Farmer → Payment History | per order |
| `fn_batch_unstored` | Farmer → batch 1 | 1000 |
| `fn_unit_free_space` | Storage → Warehouses & Units | 60000 / 56000 / 45000 |
| `fn_storage_days` | Farmer → Storage Requests | 9 and 14 |

### 3.3 Exception handling reaching the screen

Previously a constraint violation came back as a generic 500. Now the
real message reaches the user.

- Register with an email that already exists → *"That email address is
  already registered."*
- As a buyer, bid on batch 6 with quantity 50 → *"This batch requires a
  minimum bid of 400 kg; you asked for 50 kg."* (straight from the
  trigger)

### 3.4 Abstract datatype

The six flat address columns on `USERS` became one `Address` column of
type `t_address`, with `full_text()` and `short_text()` member
functions.

**The alias is mandatory** — `u.Address.District` works,
`Address.District` does not compile.

```sql
SELECT u.UserID, u.Address.District, u.Address.full_text()
FROM   USERS u WHERE ROWNUM <= 3;

SELECT type_name, attributes, methods FROM user_types;
```

---

## Part 4 — registration form

- minimum age 18, enforced in the form and again on the server
- district is a dropdown of all 64 districts, served from
  `/api/reference/districts`, and the server rejects anything not on
  that list
- upazila is now required
- at least one phone number is now required
- mobile banking number removed from the farmer fields

**Check it**

Try to register as someone born in 2015, or with the district left
blank, or with no phone number. Each is refused with a specific message.

The district list lives in `server/src/utils/districts.js` so the form
and the validation cannot drift apart. That one route is public, because
the registration form has no token yet.

*Note:* `FARMER.MobileBankingNo` is still a column in the schema. Only
the form field was removed. Say if it should be dropped properly.

---

## Part 5 — files

New:

| File | What |
|---|---|
| `database/00_reset.sql` | drops all 27 tables, sequences and types |
| `database/09_feedback_fixes.sql` | STORAGE_MANAGER, PAYMENT merge, ON DELETE |
| `database/10_object_types.sql` | `t_address` |
| `database/11_sequence_index_demo.sql` | sequence and index proof, read-only |
| `database/12_transport_one_personnel.sql` | one request, one person |
| `database/demo_multivehicle.sql` | sets up the live multi-vehicle demo |
| `client/src/pages/admin/Reports.jsx` | the Reports page |
| `server/src/utils/districts.js` | the 64 districts |

Changed: `01_create_tables.sql`, `02_sequences_triggers.sql`,
`03_insert_data.sql`, `04_views.sql`, `05_advanced_queries.sql`,
`08_plsql_layer.sql`, most of `server/src/services/`,
`server/src/middleware/errorHandler.js`, and most pages under
`client/src/`.

The migration files are all re-runnable. A rebuild from empty is:

```bash
./db.sh database/00_reset.sql
./db.sh database/01_create_tables.sql
./db.sh database/02_sequences_triggers.sql
./db.sh database/03_insert_data.sql
./db.sh database/04_views.sql
./db.sh database/08_plsql_layer.sql
```

Restart the API afterwards — its connection pool holds handles to the
old objects.

---

## Part 6 — known gaps, worth attacking

- The ER diagram still shows the old shapes. Being redrawn on paper:
  farmer-to-payment as 1:M, PAYMENT with its two subtypes, and
  TRANSPORT_REQUEST 1:1 to the order but 1:M to vehicles.
- `PersonnelID` on `ASSIGNED_TO` is now functionally dependent on
  `TransportID`. The ternary is kept because it is a graded construct
  and the vehicle genuinely varies per row, but if he pushes on
  normalisation, that is where he will push.
- SSLCommerz sandbox is not started.
- `FARMER.MobileBankingNo` is unused but still in the schema.
- Nothing is committed to git yet.
