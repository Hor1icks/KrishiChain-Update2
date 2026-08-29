# KrishiChain

An agricultural supply-chain system for Bangladesh: a farmer lists a harvest
batch, buyers bid on it, the winning bid becomes a sale order, and the produce
is stored and transported to the buyer. Payment goes directly from buyer to
farmer.

The point of the platform is the price. Produce normally passes through several
middlemen before it reaches a market, and the farmer rarely knows what the crop
is actually worth that day. Here every sale is recorded against the published
arat price and the physical bazar price for the same crop on the same date, so
the gap is visible rather than hidden.

Built for CSE-302 (Database Management Systems), Military Institute of Science
and Technology, Group A6.

---

## Stack

| Layer | Choice |
|---|---|
| Database | Oracle 11g R2 Express Edition (11.2.0.2) |
| Backend | Node.js, Express, node-oracledb in Thick mode |
| Frontend | React 19, Vite, react-router |
| Language | JavaScript throughout, JSX for components |

No ORM. Every statement is hand-written SQL, which is the point of the course.
Styling is plain CSS, state is React's Context API, and the only runtime
dependencies on the front end are `react`, `react-dom` and `react-router`.

---

## Running it

Oracle XE 11.2 must be reachable first. This project runs it in Docker:

```bash
docker start krishichain-oracle    # wait ~30s on a cold start
```

Then the schema, in order, from a SQL Developer worksheet (F5, Run Script) or
through `./db.sh`:

```bash
./db.sh database/01_create_tables.sql
./db.sh database/02_sequences_triggers.sql
./db.sh database/03_insert_data.sql
./db.sh database/04_views.sql
./db.sh database/08_plsql_layer.sql
```

`database/00_reset.sql` drops everything first if you want a genuinely clean
build. `03_insert_data.sql` wipes every table before re-seeding, so never run
it just to look at the data.

Then the two servers:

```bash
cd server && npm install && cp .env.example .env && npm start   # :5000
cd client && npm install && npm run dev                         # :5173
```

Sign in with any seeded account; they all share the password `Demo@1234`.
`abdul.karim@krishichain.bd` is a farmer with an open auction and awardable
bids, which is the most interesting starting point.

### Two things that will bite you

**node-oracledb must run in Thick mode.** The default Thin mode requires
Oracle Database 12.1 or later and cannot reach 11.2 at all. If the API dies
with `DPI-1047`, the Instant Client is not on the library path:

```bash
cd server
LD_LIBRARY_PATH=/path/to/instantclient_19_26 node src/server.js
```

A `DPI-1047` is almost never a missing file. It is usually an architecture
mismatch between XE, the Instant Client and Node.

**Quote the password in `.env`.** An unquoted `#` starts a comment, so
`DB_PASSWORD=Krishi#2026` silently becomes `Krishi` and you get `ORA-01017`.

---

## The database

27 tables, 41 foreign keys, 190 check constraints, 6 views, 22 triggers,
18 sequences, 81 indexes, 2 PL/SQL packages and one object type.

Oracle 11g shapes most of the design decisions. There are no `IDENTITY`
columns, so every surrogate key is a sequence paired with a `BEFORE INSERT`
trigger. There is no `FETCH FIRST n ROWS`, so row-limiting uses `ROWNUM` inside
an inline view. Text that may hold Bengali is `VARCHAR2(n CHAR)` rather than
byte semantics.

The schema is built around five ER constructs that the coursework grades:

**Total, disjoint specialization.** `USERS` splits into `FARMER`, `BUYER`,
`ADMIN_STAFF`, `STORAGE_MANAGER` and `TRANSPORT_PERSONNEL` as shared-primary-key
subclass tables. Everyone is exactly one of them.

**Aggregation, twice.** A `SALE_ORDER` relates to the whole fact *this buyer
placed this bid on this batch*, not to any one of the three. And a storage fee
is owed for a `STORES` allocation as a whole, not for the batch, the unit or
the manager separately, so `PAYMENT.AllocationID` points at the allocation.

**Two ternary relationships.** `STORES` ties a batch, a storage unit and the
manager who authorised it. `ASSIGNED_TO` ties a transport request, a vehicle
and the person responsible. Both stay single tables with three foreign-key
sets; splitting them into binary relationships would lose the accountability
link, which is the first thing anyone asks when stored produce goes missing.

**Two weak entities.** `STORAGE_UNIT` is identified by its warehouse, since
"unit 3" means nothing on its own. `BAZAR_DAILY_RECORD` is identified by its
bazar, with a key of (bazar, date, crop) because a market trades several crops
on the same day.

**Two recursive relationships.** `VIRTUAL_ARAT.ParentAratID` gives the arat
network a hierarchy. `BID.PreviousBidID` records which bid each new bid
displaced, so an entire bidding war is one chain inside one table.

Business rules live in the database wherever they can: a bid must clear the
batch minimum and beat the standing bid, payments may not exceed the order
total, an on-delivery order cannot be paid before it is delivered. Rules that
compare two tables are enforced by triggers, and the errors they raise are
surfaced to the user rather than swallowed.

Six workflows are multi-statement transactions that commit or roll back as a
unit: registration, storage allocation, placing a bid, awarding a winning bid,
assigning transport, and delivery with payment.

---

## Layout

```
database/    schema, seed data, views, the PL/SQL layer, migrations
server/      Express API
client/      React front end, 28 pages across five role modules
KrishiChainV1/   standalone demo build used for Project Update-1
Phase1/      one-time environment setup and connectivity checks
ER/          entity-relationship and schema diagrams
docs/        supporting notes
```

`CHANGES_AFTER_UPDATE1.md` lists everything done since the Update-1
assessment, with the queries and pages to check each change against. Start
there if you are reviewing recent work.

`KrishiChainV1/` is frozen. It is a copy of the front end with the network
layer replaced by recorded fixtures, so it runs with no backend and no
database. It was built for one presentation and is not maintained.

---

## Roles

| Role | What they do |
|---|---|
| Farmer | Register farms, list harvest batches, open auctions, award bids, request storage |
| Buyer | Browse listings, bid, pay, arrange post-sale storage, review farmers |
| Storage manager | Run warehouses and units, propose allocations, settle fees |
| Transport | Take a delivery request and move it with one or more of their vehicles |
| Admin | Publish daily prices, handle complaints, manage users, run reports |

---

## Notes

The seeded data is narratively consistent rather than random: the same five
farmers, five crops and eight batches thread through bids, orders, transport
and payments. The advanced queries depend on that. Random rows break them, and
that is the most common way a demo of this project goes wrong.

Dates are stored relative to `SYSDATE`, so the data stays current whenever the
seed is re-run.

The Oracle credentials in this repository unlock a local Docker container
holding throwaway coursework data. They are not secrets.
