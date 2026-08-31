# Project Update-2 — where each technique lives

Every item below is reachable from the running application: a form writes
to the database, a query reads it back, the page shows the result. Nothing
is labelled on screen; this file is the map.

Start the system with `./start.sh`, then sign in. All seeded accounts use
the password `Demo@1234`.

| # | Technique | In the database | Reached from |
|---|---|---|---|
| 1 | Function | `pkg_krishi_metrics` — 5 functions | Farmer dashboard, buyer payments, warehouses, batch detail, allocations |
| 2 | Subquery | Correlated subqueries throughout; key generation in all 15 inserts | Any page that creates something |
| 3 | View | 6 views | Profile, batch listings, warehouses, bidding, farmer earnings, admin dashboard |
| 4 | Abstract datatype | `t_address` object with `full_text()` / `short_text()` | Profile page |
| 5 | PL/SQL | 3 packages, 7 procedures, 5 functions | Admin → Reports |
| 6 | Cursor | `SYS_REFCURSOR` from all 6 report procedures | Admin → Reports |
| 7 | Exception handling | `ORA-20001` … `ORA-20004` | Bid below the minimum; pay before delivery |

`./db.sh database/07_update2_demo.sql` runs one worked example of each,
read-only, in the same order.

---

## Walking it in the browser

**1. Function.** Sign in as `abdul.karim@krishichain.bd`. The revenue figure
on the dashboard is `pkg_krishi_metrics.fn_farmer_revenue`, computed in
Oracle, not summed in JavaScript.

**2. Subquery.** Place a bid as `tanvir.hossain@krishichain.bd` from Browse
Listings. The new `BidID` comes from a scalar subquery inside the insert —
11g has no `IDENTITY`, so the row derives its own key:

```sql
INSERT INTO BID (BidID, BatchID, ...)
VALUES ((SELECT NVL(MAX(BidID), 0) + 1 FROM BID), :batchId, ...)
RETURNING BidID INTO :bidId;
```

**3. View.** Sign in as `farhana.yasmin@krishichain.bd`. "Still in transit"
on the admin dashboard is `V_PENDING_DELIVERY`, one seven-table join the
application queries as if it were a table.

**4. Abstract datatype.** Click your name in the top-right on any account.
The address line is `Address.full_text()` — a member function of the object
type, executed in the database.

**5. PL/SQL and 6. Cursor.** Admin → Reports. Each of the six reports calls
a procedure in `pkg_krishi_reports` that opens a `SYS_REFCURSOR`; the API
streams it to the page rather than building an array first.

**7. Exception handling.** As a buyer, bid below a batch's minimum quantity.
`pkg_krishi_rules` raises `ORA-20003` and the exact message reaches the
screen. Trying to pay an `ON_DELIVERY` order before it is delivered raises
`ORA-20002` the same way.

---

## What changed from Update-1

**No sequences, no triggers, no hand-written indexes.** Surrogate keys come
from the subquery shown above. The four business-rule triggers became
`pkg_krishi_rules`, called from the service layer inside the same
transaction; they raise the same error numbers, so nothing downstream
changed. The only indexes left are the ones Oracle creates for `PRIMARY
KEY` and `UNIQUE`.

BR-19 is simpler as a procedure than it was as a trigger. Summing `PAYMENT`
from a row trigger on `PAYMENT` raises `ORA-04091: table is mutating`, which
is why it had to be a compound trigger. A procedure has no such problem.

**Card payment.** Buyers can settle an order through SSLCommerz's sandbox
checkout. The amount is reserved as a `PENDING` payment before the session
opens, so a balance cannot be paid twice, and settlement is confirmed by
calling the gateway's validation API — the redirect body itself is never
trusted.

**Build chain.** `00_reset` → `01_create_tables` → `02_business_rules` →
`03_insert_data` → `04_views` → `05_plsql_layer`. `06_advanced_queries` and
`07_update2_demo` are read-only.
