# KrishiChain — Product Requirements Document

**Agricultural Supply Chain Management System (Farm → Virtual ARAT → Buyer)**

| Item | Value |
|---|---|
| Product name | KrishiChain |
| Version | 3.0 (development-ready) |
| Course | CSE-302: Database Management Systems Sessional |
| Group / Section | A6 / Section-A |
| Institution | Military Institute of Science and Technology |
| Stack | React.js + Bootstrap 5 · Node.js/Express · **Oracle Database 11g Release 2 Express Edition (11.2.0.2.0)** · node-oracledb in **Thick mode** + Oracle Instant Client 19c |
| Date | August 2026 |

**Submitted by:** Eftee Wasit Hadi (202214170) · Najifa Raksanda (202414010) · Aria Nawshin Ashka (202414021) · Mohammad Mushfiqur Rahman (202414038) · Farhan Intesar Mugdho (202414042)

---

## 0. Design Decisions

| # | Decision | Value |
|---|---|---|
| D-1 | Database | **Oracle 11gR2 Express Edition, 11.2.0.2.0** — no IDENTITY columns, no FETCH FIRST. Sequences + BEFORE-INSERT triggers everywhere. See §9.8 for XE-specific limits. |
| D-1a | Driver mode | **node-oracledb Thick mode is mandatory.** The default Thin mode requires Database 12.1+; it cannot connect to 11.2 at all. Requires Oracle Instant Client 19c and `oracledb.initOracleClient()` at startup. |
| D-2 | Payment model | Direct buyer → farmer. No ARAT commission, no escrow. |
| D-3 | Specialization | Physical subclass tables (`FARMER.FarmerID` is both PK and FK → `USERS`). |
| D-4 | **AUCTION entity removed** | Bidding-window attributes (`MinimumPrice`, `BiddingStartTime`, `BiddingEndTime`, `BiddingStatus`) moved onto `HARVEST_BATCH`. `BID` references the batch directly. |
| D-5 | Aggregation | `(BUYER —places— BID —on— HARVEST_BATCH)` aggregated → `creates` → `SALE_ORDER` |
| D-6 | Ternary relationships | `STORES` (Batch × Unit × Manager) and `ASSIGNED_TO` (TransportRequest × Vehicle × Personnel) |
| D-7 | Weak entities | `STORAGE_UNIT` on `WAREHOUSE`; `BAZAR_DAILY_RECORD` on `PHYSICAL_BAZAR`. `HARVEST_BATCH` is a **strong** entity with surrogate `BatchID`. |
| D-8 | Recursive relationships | `VIRTUAL_ARAT.ParentAratID` (ARAT hierarchy) and `BID.PreviousBidID` (outbid chain) |
| D-9 | Update-1 data source | Frontend mock data layer; Express wired in Phase 4 |
| D-10 | UI framework | Bootstrap 5 |
| D-11 | Bidding model | One bidding window per batch, one winning bid, whole batch to one buyer |
| D-12 | Review / Complaint | P2 — tables created and seeded, no UI in Update-1 |

**Still worth confirming:** BR-20 assumes payment happens *after* delivery. If you want payment on order confirmation, that changes the transaction in §9.8.

---

## 1. Executive Summary

KrishiChain is a database-first web application managing the complete lifecycle of an agricultural product in Bangladesh — farm registration, harvest, storage, region-based Virtual ARAT listing, competitive bidding, sale order, transport dispatch, and direct farmer payment — with daily market price monitoring layered across the chain for price transparency.

Its purpose in this course is to demonstrate a correct, normalized Oracle relational design: a specialization hierarchy, weak entities, ternary relationships, aggregation, recursive relationships, derived and multivalued attributes, referential integrity, multi-table transactions, indexes, views, and non-trivial analytical SQL — driven through a real React front end rather than through SQL Developer.

**Core flow:** a farmer registers a harvest batch → the system auto-assigns it to the nearest regional Virtual ARAT → the farmer opens a bidding window with a minimum price → verified buyers bid competitively → the farmer accepts the winning bid → a sale order is generated → transport is assigned → the buyer pays the farmer directly. Every step is recorded, so the farmer can compare the price received against the same-day market price for that crop at other ARATs and physical bazars.

---

## 2. Problem Definition

**2.1 Problems in the current system**

- Farmers sell through layered middlemen and rarely know the wholesale price their crop fetches downstream.
- Price discovery is verbal and local; the same crop trades at very different prices in nearby districts on the same day.
- Storage is under-used and unmanaged; there is no reliable record of which batch sits in which warehouse unit or for how long.
- Transport is arranged ad hoc, so a batch may travel much farther than the nearest market requires.
- Transaction history is on paper, so disputes cannot be settled and no analysis of yield, price, or demand is possible.

**2.2 Product opportunity**

One centralized relational database holding crops, farms, harvests, storage, bidding, sale orders, payments, transport and daily prices — accessible to all five stakeholder roles through role-appropriate screens, with the database itself enforcing the fairness rules (minimum price, one winning bid, capacity limits, payment integrity).

**2.3 Non-goals**

- No real payment gateway — payment records are captured, not processed.
- No GPS or live vehicle tracking; transport status is manually updated.
- No mobile app; responsive web only.
- No machine learning. "Nearest ARAT" is a deterministic district/region lookup, not a routing algorithm.
- No SMS or email delivery; notifications are in-app rows.

---

## 3. Users and Permissions

| Role | Primary needs | Allowed actions |
|---|---|---|
| **Farmer** | Sell at a fair price without a middleman | Manage own farms; create harvest batches; open bidding windows; request storage; view bids on own batches; accept the winning bid; view sale orders, transport status, payments received |
| **Buyer** | Source quality produce at a competitive price | Browse ARAT listings and open bidding windows; place/withdraw bids; view own sale orders; confirm delivery; make payment; write review; submit complaint |
| **Storage Manager** | Keep warehouse utilization efficient | Manage own warehouse and its storage units; approve/reject allocation requests; record date-in/date-out; update unit status |
| **Transport Personnel** | Complete assigned deliveries | View assigned transport requests; update pickup/delivery status; record delivery date; view vehicle assignment |
| **Admin** | Keep the marketplace trustworthy | Manage users and account status; manage crops and categories; manage Virtual ARATs and Physical Bazars; enter daily market prices; monitor bidding; resolve complaints; run all reports |

**Authorization principle.** Every protected operation checks *role* **and** *record ownership* on the server. A farmer accepts bids only on their own batches. A storage manager touches only units inside the warehouse they manage. A buyer sees another buyer's bid amount only after the bidding window closes. Password hashes are never returned to the client.

---

## 4. Scope and Release Priority

| Priority | Meaning | Modules |
|---|---|---|
| **P0 — must work** | Required for a valid DBMS demonstration | Registration/login with specialization; farm & crop management; harvest batch creation; ARAT auto-assignment; storage allocation; bidding; sale order; payment; transport; daily market price; full schema with constraints; reports |
| **P1 — high value** | Strongly recommended for final demo | Price-comparison dashboard; auto-close of bidding window at end time; warehouse utilization alerts; ARAT hierarchy rollup; notifications |
| **P2 — optional** | Only after P0/P1 are stable | Review & rating; complaint workflow; physical bazar comparison UI; audit log; partial-quantity sales |

---

## 5. Core User Journeys

| ID | Journey | Happy path |
|---|---|---|
| J-01 | Farmer onboarding | Register as Farmer → NID/bank details captured in `FARMER` → add Farm (area, soil, irrigation, district) → district maps to nearest Virtual ARAT |
| J-02 | Harvest to listing | Create harvest batch (farm, crop, quantity, grade, moisture) → optionally request storage → batch auto-assigned to nearest ARAT → farmer sets minimum price and bidding window → status `BIDDING_OPEN` |
| J-03 | Storage allocation (ternary) | Farmer requests storage → storage manager selects a unit with free capacity → `STORES` row records batch + unit + manager + quantity + date-in → unit status recalculated |
| J-04 | Bidding | Buyers browse ARAT listings → place bids above the current highest and at or above the minimum price → each new bid marks the previous highest as `OUTBID` and links to it → window closes at end time |
| J-05 | Award to payment | Farmer accepts the winning bid → sale order created + batch quantities updated + transport request created, all atomically → transport assigned to vehicle + personnel → delivery completed → buyer pays farmer directly |
| J-06 | Price transparency | Admin logs daily market price per crop per ARAT and physical bazar daily records → farmer dashboard compares accepted price vs same-day ARAT price vs bazar price vs crop base price |
| J-07 | Admin oversight | Admin filters users/bids/complaints → changes status → views reports: yield by crop, warehouse utilization, price trend, unsold batches, payment reconciliation |

---

## 6. Functional Requirements

**FR-AUTH — Accounts and specialization**
- Register with unique email and phone; role selected at registration and immutable afterwards.
- Registration writes one `USERS` row **and** exactly one subclass row in the same transaction (disjoint, total specialization).
- Password stored as a hash only. Blocked/inactive accounts cannot perform protected actions.
- Multiple phone numbers per user supported through a separate table.

**FR-FARM — Farm management**
- Farmer creates/edits/deactivates own farms: name, area, soil type, irrigation type, location, district.
- A farm belongs to exactly one farmer; a farmer may own many farms.
- Farm district determines the assigned Virtual ARAT for all batches from that farm.

**FR-CROP — Crop catalogue (admin)**
- Admin manages crop name, category, unit, base price, shelf life, description.
- Base price is the regulatory floor: no batch may set a minimum price below it.

**FR-HARVEST — Harvest batches and bidding window**
- Farmer records batch: farm, crop, harvest date, total quantity, quality grade, moisture percentage.
- Farmer sets `MinimumPrice`, `BiddingStartTime`, `BiddingEndTime` on the batch to open it for bidding.
- `AvailableQuantity` is derived as `Total − Reserved − Sold`.
- Status lifecycle: `CREATED → STORED → LISTED → BIDDING_OPEN → BIDDING_CLOSED → SOLD → DELIVERED` (or `EXPIRED`).

**FR-STORE — Warehouse and storage units**
- Warehouse has many numbered storage units; a unit is identified only within its warehouse (weak entity).
- Allocation records which batch went into which unit, authorised by which manager, in what quantity, with date-in and date-out.
- A unit's current load may never exceed its capacity; the allocation transaction rolls back if it would.

**FR-ARAT — Virtual ARAT**
- Every batch is auto-assigned to the ARAT serving its farm's district.
- ARATs form a hierarchy: a central/district ARAT supervises regional sub-ARATs (recursive relationship).
- ARAT hosts listings and maintains daily market prices.

**FR-BID — Bidding**
- Buyer bid must be at or above the batch `MinimumPrice` **and** strictly above the current highest bid.
- Requested quantity ≤ available quantity of the batch.
- A farmer may not bid on their own batch. A buyer may hold only one `ACTIVE` bid per batch.
- Bids accepted only while batch status is `BIDDING_OPEN` and `SYSDATE < BiddingEndTime`.
- Each new bid records `PreviousBidID`, forming a traceable outbid chain.
- `CurrentHighestBid` is derived from the bid set, never typed in.
- Bid status: `ACTIVE → OUTBID / WON / WITHDRAWN`.

**FR-ORDER — Sale order**
- Exactly one sale order per winning bid, and at most one winning bid per batch (aggregation — see §7.2).
- Records accepted quantity, accepted price/kg, derived total amount, order date, status.
- Creating a sale order simultaneously updates batch quantities and creates the transport request.

**FR-PAY — Payment (direct buyer → farmer)**
- Payment links sale order, paying buyer, and receiving farmer.
- Records amount, method, date, transaction reference, status (`PENDING / COMPLETED / FAILED / REFUNDED`).
- Total payments against a sale order may not exceed its total amount.

**FR-TRANS — Transport**
- Transport request links a sale order to a vehicle and a transport personnel (ternary).
- Vehicle capacity must be ≥ the accepted quantity.
- Status: `ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED` or `FAILED`.

**FR-PRICE — Daily market price**
- One price row per crop per ARAT per date.
- Physical bazar daily records capture transaction volume and revenue for external comparison.
- Historical prices accumulate; they are never overwritten.

**FR-FEEDBACK — Review and complaint (P2)**
- Buyer reviews a completed sale order once (rating 1–5 + comment).
- Complaint carries type, description, status, resolution date; handled by admin.

**FR-REPORT — Reporting**
- Harvest, storage utilization, sales, payment, price trend and user activity reports served from Oracle views and aggregate queries.

---

## 7. ER Model — Advanced Constructs

### 7.1 Specialization / Generalization

`USERS` **ISA** `FARMER`, `BUYER`, `ADMIN`, `STORAGE_MANAGER`, `TRANSPORT_PERSONNEL`.

- **Disjoint** (a user holds exactly one role) and **total** (every user is one of the five).
- Draw with a triangle/circle carrying **"d"**, and a **double line** from `USERS` to the specialization circle for total participation.
- Discriminator column: `USERS.Role`.
- Implemented as five subclass tables whose PK is also an FK to `USERS`.

### 7.2 Aggregation — Bidding → Sale Order

The relationship set **`BUYER —places— BID —on— HARVEST_BATCH`** is aggregated into one abstract unit, and *that aggregate* participates in the relationship **`creates`** with `SALE_ORDER`.

**Why it's genuine:** a sale order does not exist because of a buyer alone, or a batch alone, or a bid amount alone — it exists because *a particular buyer's bid on a particular batch won*. Relating `SALE_ORDER` separately to `BUYER` and to `HARVEST_BATCH` creates a redundant path that can contradict the bid it came from. Aggregation is the correct construct.

**How to draw it:** dashed rectangle enclosing `BUYER`, `places`, `BID`, `on`, and `HARVEST_BATCH`. Connect the box edge to the `creates` diamond, then to `SALE_ORDER`.

### 7.3 Ternary relationships

**T-1 `STORES` — HarvestBatch × StorageUnit × StorageManager**
Attributes: `QuantityStored`, `DateIn`, `DateOut`, `AllocationStatus`.
A *manager* authorises a *batch* into a *unit*. Knowing only batch + unit loses accountability for who approved the allocation, which is exactly what matters in a spoilage dispute.

**T-2 `ASSIGNED_TO` — TransportRequest × Vehicle × TransportPersonnel**
Attributes: `AssignedDate`, `AssignmentStatus`.
The same request can be reassigned to a different driver/vehicle pair, and the same driver drives different vehicles on different days. Splitting this into two binaries loses which driver used which vehicle for which delivery.

Draw each as a single diamond with three lines to three entities. Each becomes a table with three FK sets.

### 7.4 Weak entities

**W-1 `STORAGE_UNIT` weak on `WAREHOUSE`**
Partial key `UnitNo`; full identifier `(WarehouseID, UnitNo)`. Unit "12" means nothing outside its warehouse — every warehouse numbers units from 1.
Draw: **double rectangle** `STORAGE_UNIT`, **double diamond** `CONTAINS`, **double line** to `WAREHOUSE`, **dashed-underlined** `UnitNo`.

**W-2 `BAZAR_DAILY_RECORD` weak on `PHYSICAL_BAZAR`**
Partial key `RecordDate`; full identifier `(BazarID, RecordDate)`. A daily volume/revenue figure has no independent existence — it is always "this bazar, this date."
This also fixes a normalization problem in the original list, where `DailyTransactionVolume`, `DailyRevenue` and `LastUpdated` sat as plain columns on `PHYSICAL_BAZAR`, meaning today's figures overwrote yesterday's and all history was destroyed.

`HARVEST_BATCH` is now a **strong** entity with surrogate `BatchID` — this keeps every downstream foreign key single-column.

### 7.5 Recursive relationships (self-joins)

**R-1 `VIRTUAL_ARAT.ParentAratID → VIRTUAL_ARAT.AratID` — "SUPERVISES"**
A district-level central ARAT oversees several upazila-level sub-ARATs. 1:N recursive, optional participation on both sides. Mirrors real arat structure and powers the hierarchical `CONNECT BY` report (Q6).

**R-2 `BID.PreviousBidID → BID.BidID` — "OUTBIDS"**
Each bid records the bid it displaced, producing a traceable bidding chain per batch. 1:1 recursive, optional.

Draw each as a single diamond with two lines back to the same entity box, with role labels (`parent`/`child`, `outbids`/`outbid by`).

### 7.6 Other constructs to mark on the diagram

| Construct | Where |
|---|---|
| **Composite attributes** | `USERS.Name` (First, Middle, Last); `USERS.Address` (HouseNo, Road, Village, Upazila, District, PostalCode) |
| **Multivalued attribute** | `USERS.PhoneNo` — double ellipse; decomposes to `USER_PHONE` |
| **Derived attributes** | `HARVEST_BATCH.AvailableQuantity`, `HARVEST_BATCH.CurrentHighestBid`, `STORAGE_UNIT.CurrentLoad`, `WAREHOUSE.AvailableCapacity`, `SALE_ORDER.TotalAmount`, `USERS.Age` — dashed ellipses |
| **Total participation** | Every `HARVEST_BATCH` belongs to a `FARM`; every `BID` belongs to a `HARVEST_BATCH`; every subclass row has a `USERS` row; every `STORAGE_UNIT` has a `WAREHOUSE` |
| **Relationship attributes** | `STORES.QuantityStored/DateIn/DateOut`; `ASSIGNED_TO.AssignedDate` |

### 7.7 Corrections applied to the original entity list

| Issue | Correction | Reason |
|---|---|---|
| `AUCTION` as a separate entity | **Removed.** `MinimumPrice`, `BiddingStartTime`, `BiddingEndTime`, `BiddingStatus` moved to `HARVEST_BATCH` | One bidding window per batch means the auction row was in 1:1 with the batch — a needless table and join |
| `HARVEST_BATCH` had both `FarmerID` and `FarmID` | Keep `FarmID` only | Transitive dependency — the farmer is fully determined by the farm |
| `Crop.Category` as free text | `CROP_CATEGORY` reference table | Prevents "Vegetable"/"vegetables"/"VEG" drift in filters |
| `VirtualARAT lists HarvestBatch` drawn M:N | 1:N — `AratID` FK on `HARVEST_BATCH` | Auto-assignment to the *nearest* ARAT means exactly one ARAT per batch |
| `DailyMarketPrice.PriceID` surrogate | PK `(CropID, AratID, PriceDate)` | Otherwise the same crop/ARAT/day can be logged twice with different prices |
| `PhysicalBazar` held daily figures as columns | Split into weak `BAZAR_DAILY_RECORD` | Repeating group destroying history |
| `Review`/`Complaint` held both `BuyerID` and `SaleOrderID` | `SaleOrderID` only | Redundant — the order determines the buyer |
| `Payment` holds `BuyerID` and `FarmerID` | **Kept**, despite being derivable | Deliberate denormalization for audit immutability — records who actually paid whom even if an order is later amended. Declare this as an intentional exception in the viva |

---

## 8. Business Rules and Acceptance Criteria

| ID | Rule | Acceptance criterion |
|---|---|---|
| BR-01 | Email and phone unique across all users | Duplicate registration rejected by UNIQUE constraint |
| BR-02 | Every user has exactly one subclass row matching `Role` | `USERS` insert without its subclass row fails the registration transaction |
| BR-03 | Passwords stored hashed only | No plain-text value in any table |
| BR-04 | A farm belongs to exactly one farmer; batches inherit that farmer | Cross-farmer batch insert rejected |
| BR-05 | `TotalQuantity > 0`; `Available = Total − Reserved − Sold`, never negative | CHECK constraints + transaction recalculation |
| BR-06 | `MoisturePercentage` 0–100; `QualityGrade` in ('A','B','C') | CHECK constraints |
| BR-07 | Allocation cannot push a unit's load above its capacity | Over-capacity allocation rolls back with a clear error |
| BR-08 | A batch cannot be allocated to the same unit twice on the same date | UNIQUE(BatchID, WarehouseID, UnitNo, DateIn) |
| BR-09 | Batch `MinimumPrice ≥ Crop.BasePrice` | Opening a window below base price rejected |
| BR-10 | `BiddingEndTime > BiddingStartTime`, and end time in the future when opened | CHECK + server validation |
| BR-11 | Bid must be ≥ `MinimumPrice` **and** > current highest bid | Lower/equal bid rejected |
| BR-12 | `RequestedQuantity ≤ AvailableQuantity` | Over-quantity bid rejected |
| BR-13 | A farmer cannot bid on their own batch | Rejected by server ownership check |
| BR-14 | One `ACTIVE` bid per buyer per batch | Server check; second active bid rejected |
| BR-15 | Bids accepted only when status is `BIDDING_OPEN` and before `BiddingEndTime` | Late bid returns validation error |
| BR-16 | At most one `WON` bid per batch, and exactly one sale order per winning bid | UNIQUE on `SALE_ORDER.BidID`; second award attempt rejected |
| BR-17 | Award is atomic: bid → `WON`, batch → `SOLD`, sale order insert, quantity update, transport request insert | Forced failure of any step rolls all five back |
| BR-18 | Vehicle capacity ≥ accepted quantity | Assignment rejected otherwise |
| BR-19 | Payments for a sale order may not exceed its total amount | Over-payment rejected |
| BR-20 | Payment allowed only when transport status is `DELIVERED` | Early payment returns validation error |
| BR-21 | One daily price row per crop per ARAT per date | Second insert for the same triple rejected by PK |
| BR-22 | An ARAT cannot be its own parent, and the hierarchy has no cycles | CHECK `ParentAratID <> AratID`; `CONNECT BY NOCYCLE` |
| BR-23 | One review per sale order | UNIQUE(SaleOrderID) |
| BR-24 | Historical records use status changes, not deletion | Deleting a user with sale orders blocked by restrictive FK |
| BR-25 | A bid may reference only a bid on the same batch as its predecessor | Server check on `PreviousBidID` |

---

## 9. Relational Schema (Oracle 11g)

**24 core tables + 2 optional (P2).** ✚ = composite key.

### 9.1 Identity and specialization

| # | Table | PK | Key columns | Constraints |
|---|---|---|---|---|
| 1 | `USERS` | `UserID` | FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role | UQ(Email); CHECK Role in 5 values; CHECK Status in ('ACTIVE','BLOCKED','INACTIVE'); CHECK Gender |
| 2 | `USER_PHONE` | ✚(UserID, PhoneNo) | — | FK→USERS ON DELETE CASCADE *(multivalued attribute)* |
| 3 | `FARMER` | `FarmerID` | NID, BankAccountNo, MobileBankingNo, ExperienceYears | PK is FK→USERS; UQ(NID); CHECK ExperienceYears ≥ 0 |
| 4 | `BUYER` | `BuyerID` | BusinessName, BuyerType, TradeLicenseNo | PK is FK→USERS; UQ(TradeLicenseNo); CHECK BuyerType in ('WHOLESALER','RETAILER','EXPORTER','PROCESSOR') |
| 5 | `ADMIN_STAFF` | `AdminID` | EmployeeID, Designation | PK is FK→USERS; UQ(EmployeeID) |
| 6 | `STORAGE_MANAGER` | `ManagerID` | EmployeeID | PK is FK→USERS; UQ(EmployeeID) |
| 7 | `TRANSPORT_PERSONNEL` | `PersonnelID` | LicenseNo, ExperienceYears | PK is FK→USERS; UQ(LicenseNo) |

### 9.2 Production and market listing

| # | Table | PK | Key columns | Constraints |
|---|---|---|---|---|
| 8 | `CROP_CATEGORY` | `CategoryID` | CategoryName, Description | UQ(CategoryName) |
| 9 | `CROP` | `CropID` | CropName, CategoryID, Unit, BasePrice, ShelfLifeDays, Description | FK→CROP_CATEGORY; UQ(CropName); CHECK BasePrice > 0 |
| 10 | `FARM` | `FarmID` | FarmerID, FarmName, Area, SoilType, IrrigationType, Location, District, Status | FK→FARMER; CHECK Area > 0 |
| 11 | `VIRTUAL_ARAT` | `AratID` | AratName, Region, District, Address, ContactNo, **ParentAratID** | **Self-FK**→VIRTUAL_ARAT; CHECK ParentAratID <> AratID |
| 12 | `HARVEST_BATCH` | `BatchID` | FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, **MinimumPrice, BiddingStartTime, BiddingEndTime**, Status | FK→FARM, FK→CROP, FK→VIRTUAL_ARAT; CHECK quantities ≥ 0; CHECK Grade in ('A','B','C'); CHECK Moisture 0–100; CHECK BiddingEndTime > BiddingStartTime; CHECK Status in 7 values |

### 9.3 Storage

| # | Table | PK | Key columns | Constraints |
|---|---|---|---|---|
| 13 | `WAREHOUSE` | `WarehouseID` | WarehouseName, Address, District, Capacity, ManagerID | FK→STORAGE_MANAGER; CHECK Capacity > 0 |
| 14 | `STORAGE_UNIT` | ✚(WarehouseID, UnitNo) | Capacity, Status | **Weak on WAREHOUSE**; FK→WAREHOUSE ON DELETE CASCADE; CHECK Capacity > 0; CHECK Status in ('EMPTY','PARTIAL','FULL','MAINTENANCE') |
| 15 | `STORES` | `AllocationID` | BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus | **Ternary**; FK→HARVEST_BATCH, FK→STORAGE_UNIT (composite), FK→STORAGE_MANAGER; UQ(BatchID, WarehouseID, UnitNo, DateIn); CHECK DateOut ≥ DateIn; CHECK QuantityStored > 0 |

### 9.4 Bidding, sale and payment

| # | Table | PK | Key columns | Constraints |
|---|---|---|---|---|
| 16 | `BID` | `BidID` | BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, **PreviousBidID** | FK→HARVEST_BATCH, FK→BUYER, **self-FK**→BID; CHECK BidPricePerKg > 0; CHECK RequestedQuantity > 0; CHECK Status in ('ACTIVE','OUTBID','WON','WITHDRAWN'); CHECK PreviousBidID <> BidID |
| 17 | `SALE_ORDER` | `SaleOrderID` | BidID, AcceptedQuantity, AcceptedPricePerKg, TotalAmount *(virtual)*, OrderDate, Status | **UQ(BidID)** — aggregation result; FK→BID; CHECK AcceptedQuantity > 0; CHECK Status in ('CONFIRMED','IN_TRANSIT','COMPLETED','CANCELLED') |
| 18 | `PAYMENT` | `PaymentID` | SaleOrderID, BuyerID, FarmerID, Amount, PaymentMethod, PaymentDate, TransactionReference, PaymentStatus | FK→SALE_ORDER, FK→BUYER, FK→FARMER; UQ(TransactionReference); CHECK Amount > 0; CHECK PaymentStatus in ('PENDING','COMPLETED','FAILED','REFUNDED') |

### 9.5 Logistics

| # | Table | PK | Key columns | Constraints |
|---|---|---|---|---|
| 19 | `VEHICLE` | `VehicleID` | VehicleNo, VehicleType, Capacity, Status | UQ(VehicleNo); CHECK Capacity > 0 |
| 20 | `TRANSPORT_REQUEST` | `TransportID` | SaleOrderID, PickupLocation, DeliveryLocation, RequestDate, DeliveryDate, DeliveryStatus | FK→SALE_ORDER; UQ(SaleOrderID); CHECK DeliveryStatus in ('PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','FAILED') |
| 21 | `ASSIGNED_TO` | `AssignmentID` | TransportID, VehicleID, PersonnelID, AssignedDate, AssignmentStatus | **Ternary**; FK→TRANSPORT_REQUEST, FK→VEHICLE, FK→TRANSPORT_PERSONNEL; UQ(TransportID, VehicleID, PersonnelID) |

### 9.6 Price reference

| # | Table | PK | Key columns | Constraints |
|---|---|---|---|---|
| 22 | `DAILY_MARKET_PRICE` | ✚(CropID, AratID, PriceDate) | PricePerKg, MinPrice, MaxPrice, LoggedBy | FK→CROP, FK→VIRTUAL_ARAT, FK→ADMIN_STAFF; CHECK MinPrice ≤ PricePerKg ≤ MaxPrice |
| 23 | `PHYSICAL_BAZAR` | `BazarID` | BazarName, Address, District, ContactNo | UQ(BazarName, District) |
| 24 | `BAZAR_DAILY_RECORD` | ✚(BazarID, RecordDate) | CropID, TransactionVolume, Revenue | **Weak on PHYSICAL_BAZAR**; FK→PHYSICAL_BAZAR ON DELETE CASCADE, FK→CROP; CHECK Volume ≥ 0; CHECK Revenue ≥ 0 |

### 9.7 Feedback (P2 — create and seed, no UI)

| # | Table | PK | Key columns | Constraints |
|---|---|---|---|---|
| 25 | `REVIEW` | `ReviewID` | SaleOrderID, Rating, Comment, ReviewDate | UQ(SaleOrderID); CHECK Rating 1–5 |
| 26 | `COMPLAINT` | `ComplaintID` | SaleOrderID, ComplaintType, Description, Status, ResolutionDate, HandledByAdminID | FK→SALE_ORDER, FK→ADMIN_STAFF; CHECK Status in ('OPEN','IN_REVIEW','RESOLVED','REJECTED') |

### 9.8 Oracle 11gR2 XE — environment constraints

XE is not just "11g with a smaller licence." It is a restricted edition, and three of its restrictions affect this project directly.

**9.8.1 Driver compatibility — the blocking issue**

node-oracledb's default **Thin mode connects only to Oracle Database 12.1 and later.** It cannot talk to XE 11.2 at all. **Thick mode connects to 11.2 or later, depending on the Oracle Client library version** — and with Oracle Client 19c libraries, connection back to Database 11.2 is supported.

Therefore:

```js
// server/db/pool.js — MUST run before any getConnection()
const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: 'C:\\oracle\\instantclient_19_x' });

await oracledb.createPool({
  user:          process.env.ORACLE_USER,
  password:      process.env.ORACLE_PASSWORD,
  connectString: 'localhost:1521/XE',   // XE's SID is fixed as XE
  poolMin: 2, poolMax: 10, poolIncrement: 1
});
```

**Architecture must match across all three components.** If a team member installed `OracleXE112_Win32.zip`, their Instant Client **and** their Node.js must also be 32-bit. Mixing a 64-bit Node with a 32-bit Instant Client produces a `DPI-1047` library-load error that looks like a missing-file problem but is not. Everyone should install the same build — agree on **Windows 64-bit** unless someone's machine forces otherwise.

**9.8.2 XE resource and feature limits**

| Limit | Value | Impact on KrishiChain |
|---|---|---|
| User data | 11 GB | None — our seed set is a few hundred KB |
| RAM | 1 GB | None at demo scale |
| CPU | 1 core | None |
| Instances per machine | **One only, SID fixed as `XE`** | Everyone's connect string is identical: `localhost:1521/XE`. Separate team members' schemas by **user**, not by database |
| Partitioning, parallel query, bitmap indexes, MV query rewrite, Flashback Database | **Not available** | None used in this design — verify no one adds them |
| APEX | Bundled, occupies **port 8080** | Pick a different port for Express (5000 is fine) or the server won't start |

Create one application user per team member or one shared app user — never develop as `SYS` or `SYSTEM`:

```sql
CREATE USER krishichain IDENTIFIED BY <password>;
GRANT CONNECT, RESOURCE TO krishichain;
GRANT CREATE VIEW, CREATE SEQUENCE, CREATE TRIGGER TO krishichain;
ALTER USER krishichain QUOTA UNLIMITED ON USERS;
```

**9.8.3 Character set — matters for Bengali text**

Check before writing any DDL:

```sql
SELECT parameter, value FROM nls_database_parameters
WHERE parameter IN ('NLS_CHARACTERSET','NLS_NCHAR_CHARACTERSET');
```

If the result is `AL32UTF8`, Bengali characters store fine — **but length semantics are in bytes by default**, and a Bengali character costs 3 bytes in UTF-8. `VARCHAR2(50)` then holds only about 16 Bengali characters, and inserts fail with `ORA-12899: value too large for column` on a name that visually fits.

**Rule for this project:** declare character semantics explicitly on every text column that may hold Bengali — crop names, farmer names, village/upazila/district, bazar names, addresses, comments:

```sql
CropName    VARCHAR2(100 CHAR) NOT NULL,
Village     VARCHAR2(100 CHAR),
Comment     VARCHAR2(500 CHAR)
```

If the character set turns out to be `WE8MSWIN1252`, Bengali cannot be stored at all — in that case keep all seed data in English/transliteration and note it as a known limitation. Do not attempt to change the database character set on an existing XE install.

**9.8.4 Optional upgrade path**

The same Oracle download area also offers **Oracle Database 18c XE**, which removes most of the friction above: `IDENTITY` columns, `FETCH FIRST n ROWS ONLY`, 12 GB data, and node-oracledb **Thin mode support** (no Instant Client needed at all). If your faculty permits it, 18c XE would cut roughly a day of setup work and remove ~24 sequence/trigger pairs from the DDL.

**Recommendation: stay on 11gR2 XE.** Your proposal names 11g, the faculty are expecting it, and switching database versions in the week before a graded checkpoint is a bad trade. Note 18c as future work in the final report instead.

### 9.9 Oracle 11g implementation standards

**11g has no `IDENTITY` columns.** Every surrogate PK needs a sequence and a trigger:

```sql
CREATE SEQUENCE seq_user_id START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE OR REPLACE TRIGGER trg_user_id
BEFORE INSERT ON USERS
FOR EACH ROW
WHEN (NEW.UserID IS NULL)
BEGIN
  SELECT seq_user_id.NEXTVAL INTO :NEW.UserID FROM dual;
END;
/
```

| Category | 11g recommendation |
|---|---|
| Surrogate keys | `NUMBER(10)` + sequence + BEFORE-INSERT trigger (one pair per table) |
| Short text | `VARCHAR2(n CHAR)` — **always with `CHAR` semantics** on any column that may hold Bengali (see §9.8.3) |
| Long text | `CLOB` for Description, Comment, Complaint Description |
| Money | `NUMBER(12,2)` |
| Quantity | `NUMBER(12,3)` (kg with grams) |
| Dates | `DATE` for calendar dates; `TIMESTAMP` for BidTime, BiddingStartTime, BiddingEndTime |
| Booleans | `CHAR(1)` + `CHECK IN ('Y','N')` |
| Derived columns | Virtual columns: `TotalAmount NUMBER(14,2) GENERATED ALWAYS AS (AcceptedQuantity * AcceptedPricePerKg) VIRTUAL`. **Test this on XE on Day 1** — if it errors, fall back to computing the total in the `SELECT` or in a view |
| Row limiting | **`ROWNUM` inside an inline view — `FETCH FIRST n ROWS` does not exist in 11g** |
| Naming | `PK_`, `FK_`, `UQ_`, `CK_`, `IX_` prefixes so constraint violations are readable during the demo |

**Indexes.** Oracle does **not** auto-index foreign keys — index every FK column (a standard viva question). Plus: `IX_BID_BATCH_PRICE(BatchID, BidPricePerKg DESC)`, `IX_BATCH_STATUS(Status, AratID)`, `IX_PRICE_DATE(PriceDate, CropID)`, `IX_ORDER_DATE(OrderDate)`, `IX_STORES_OPEN(WarehouseID, UnitNo, DateOut)`.

### 9.10 Transactions requiring atomicity

| Transaction | Statements that must commit together |
|---|---|
| **Registration** | INSERT `USERS` + INSERT subclass row + INSERT `USER_PHONE` rows |
| **Storage allocation** | INSERT `STORES` + UPDATE `STORAGE_UNIT.Status` + UPDATE batch → `STORED` |
| **Place bid** | INSERT `BID` + UPDATE previous highest bid → `OUTBID` + set `PreviousBidID` |
| **Award winning bid** | UPDATE `BID` → `WON` + UPDATE batch (`SOLD`, quantities) + INSERT `SALE_ORDER` + INSERT `TRANSPORT_REQUEST` |
| **Assign transport** | INSERT `ASSIGNED_TO` + UPDATE `VEHICLE.Status` + UPDATE `TRANSPORT_REQUEST` → `ASSIGNED` |
| **Delivery + payment** | UPDATE `TRANSPORT_REQUEST` → `DELIVERED` + UPDATE `SALE_ORDER` → `COMPLETED` + INSERT `PAYMENT` |

Each runs on one connection with explicit `COMMIT` on success and `ROLLBACK` in the catch block. **Award the winning bid is the demo centrepiece** — show a forced failure rolling back all four statements.

### 9.11 Recommended views

| View | Purpose |
|---|---|
| `V_BATCH_AVAILABILITY` | Batch with derived AvailableQuantity, farm, farmer, crop, ARAT, current highest bid |
| `V_UNIT_UTILIZATION` | Storage unit capacity vs current load vs free space |
| `V_BIDDING_SUMMARY` | Batch with bid count, highest bid, minimum price, time remaining |
| `V_FARMER_EARNINGS` | Farmer totals: batches sold, quantity, revenue, average price |
| `V_PRICE_COMPARISON` | Accepted price vs same-day ARAT price vs bazar price vs base price |
| `V_PENDING_DELIVERY` | Sale orders not yet delivered, with driver and vehicle |

---

## 10. Advanced Queries (7 candidates — pick 5)

All 11g-safe. Each answers a real business question, which is what you'll be asked to justify.

**Q1 — Price transparency: did the farmer beat the market?**
```sql
SELECT c.CropName, va.AratName, so.OrderDate,
       so.AcceptedPricePerKg, dmp.PricePerKg AS MarketPrice, c.BasePrice,
       ROUND(((so.AcceptedPricePerKg - dmp.PricePerKg) / dmp.PricePerKg) * 100, 2) AS PctVsMarket
FROM SALE_ORDER so
JOIN BID b            ON so.BidID = b.BidID
JOIN HARVEST_BATCH hb ON b.BatchID = hb.BatchID
JOIN CROP c           ON hb.CropID = c.CropID
JOIN VIRTUAL_ARAT va  ON hb.AratID = va.AratID
JOIN DAILY_MARKET_PRICE dmp
     ON dmp.CropID = c.CropID AND dmp.AratID = va.AratID
    AND dmp.PriceDate = TRUNC(so.OrderDate)
ORDER BY PctVsMarket DESC;
```

**Q2 — Top-earning farmers per district (analytic ranking).**
```sql
SELECT * FROM (
  SELECT u.District,
         u.FirstName || ' ' || u.LastName AS Farmer,
         COUNT(so.SaleOrderID) AS OrdersCompleted,
         SUM(so.TotalAmount)   AS TotalEarnings,
         RANK() OVER (PARTITION BY u.District
                      ORDER BY SUM(so.TotalAmount) DESC) AS Rnk
  FROM SALE_ORDER so
  JOIN BID b            ON so.BidID = b.BidID
  JOIN HARVEST_BATCH hb ON b.BatchID = hb.BatchID
  JOIN FARM f           ON hb.FarmID = f.FarmID
  JOIN USERS u          ON f.FarmerID = u.UserID
  WHERE so.Status = 'COMPLETED'
  GROUP BY u.District, u.FirstName, u.LastName
) WHERE Rnk <= 3;
```

**Q3 — Warehouse utilization with over-capacity alert (LEFT JOIN keeps empty units visible).**
```sql
SELECT w.WarehouseName, su.UnitNo, su.Capacity,
       NVL(SUM(s.QuantityStored), 0) AS CurrentLoad,
       ROUND(NVL(SUM(s.QuantityStored),0) / su.Capacity * 100, 1) AS UtilPct,
       CASE WHEN NVL(SUM(s.QuantityStored),0) / su.Capacity > 0.8
            THEN 'CRITICAL' ELSE 'OK' END AS AlertLevel
FROM WAREHOUSE w
JOIN STORAGE_UNIT su ON w.WarehouseID = su.WarehouseID
LEFT JOIN STORES s   ON s.WarehouseID = su.WarehouseID
                    AND s.UnitNo      = su.UnitNo
                    AND s.DateOut IS NULL
GROUP BY w.WarehouseName, su.UnitNo, su.Capacity
ORDER BY UtilPct DESC;
```

**Q4 — Bidding competitiveness by crop, plus unsold batches (`NOT EXISTS` anti-join).**
```sql
SELECT c.CropName,
       COUNT(DISTINCT hb.BatchID) AS BatchesListed,
       COUNT(b.BidID)             AS TotalBids,
       ROUND(AVG(b.BidPricePerKg), 2) AS AvgBidPrice,
       MAX(b.BidPricePerKg)           AS HighestBid
FROM HARVEST_BATCH hb
JOIN CROP c   ON hb.CropID = c.CropID
LEFT JOIN BID b ON hb.BatchID = b.BatchID
GROUP BY c.CropName
HAVING COUNT(b.BidID) > (
    SELECT AVG(cnt) FROM (SELECT COUNT(*) cnt FROM BID GROUP BY BatchID))
UNION ALL
SELECT 'NO BIDS RECEIVED', COUNT(*), 0, 0, 0
FROM HARVEST_BATCH hb
WHERE NOT EXISTS (SELECT 1 FROM BID b WHERE b.BatchID = hb.BatchID);
```

**Q5 — Month-over-month price trend per crop (`LAG` window function).**
```sql
SELECT CropName, PriceMonth, AvgPrice, PrevPrice,
       ROUND((AvgPrice - PrevPrice) / NULLIF(PrevPrice,0) * 100, 2) AS PctChange
FROM (
  SELECT c.CropName,
         TO_CHAR(dmp.PriceDate, 'YYYY-MM') AS PriceMonth,
         ROUND(AVG(dmp.PricePerKg), 2)     AS AvgPrice,
         LAG(ROUND(AVG(dmp.PricePerKg), 2)) OVER
             (PARTITION BY c.CropName
              ORDER BY TO_CHAR(dmp.PriceDate, 'YYYY-MM')) AS PrevPrice
  FROM DAILY_MARKET_PRICE dmp
  JOIN CROP c ON dmp.CropID = c.CropID
  GROUP BY c.CropName, TO_CHAR(dmp.PriceDate, 'YYYY-MM')
)
ORDER BY CropName, PriceMonth;
```

**Q6 — ARAT hierarchy rollup (`CONNECT BY` on the recursive relationship).**
```sql
SELECT LPAD(' ', 3 * (LEVEL - 1)) || va.AratName AS AratHierarchy,
       LEVEL AS Tier, va.District,
       (SELECT COUNT(*) FROM HARVEST_BATCH hb WHERE hb.AratID = va.AratID) AS Batches,
       (SELECT NVL(SUM(hb.TotalQuantity),0) FROM HARVEST_BATCH hb
        WHERE hb.AratID = va.AratID) AS TotalVolumeKg
FROM VIRTUAL_ARAT va
START WITH va.ParentAratID IS NULL
CONNECT BY NOCYCLE PRIOR va.AratID = va.ParentAratID
ORDER SIBLINGS BY va.AratName;
```

**Q7 — Payment reconciliation: delivered but unpaid.**
```sql
SELECT so.SaleOrderID, so.TotalAmount, tr.DeliveryDate,
       u.FirstName || ' ' || u.LastName AS Buyer
FROM SALE_ORDER so
JOIN TRANSPORT_REQUEST tr ON so.SaleOrderID = tr.SaleOrderID
JOIN BID b   ON so.BidID = b.BidID
JOIN USERS u ON b.BuyerID = u.UserID
WHERE tr.DeliveryStatus = 'DELIVERED'
AND so.SaleOrderID NOT IN (
    SELECT SaleOrderID FROM PAYMENT WHERE PaymentStatus = 'COMPLETED');
```

**Recommended five:** Q1, Q2, Q3, Q5, Q6 — covering multi-table joins, analytic ranking, outer joins with aggregation, window functions, and hierarchical queries, with no technique repeated.

---

## 11. Architecture and Front-End Plan

### 11.1 Stack layers

| Layer | Technology | Responsibility |
|---|---|---|
| Client | React.js + React Router + Bootstrap 5 + Axios | Role-based pages, forms, tables, dashboards |
| Server | Node.js + Express.js | REST routes, auth, validation, business rules, transaction orchestration |
| Data access | node-oracledb **(Thick mode)** + Oracle Instant Client 19c | Connection pool, bind variables, commit/rollback. `initOracleClient()` must run before the first connection |
| Database | Oracle 11gR2 XE (11.2.0.2.0), SID `XE`, port 1521 | Tables, constraints, sequences, triggers, views, PL/SQL |
| Tools | VS Code, SQL Developer, Postman, Git/GitHub | Development, SQL testing, API testing, versioning |

**Port note:** XE's bundled APEX occupies **port 8080**. Run Express on **5000** and React's dev server on 3000 so nothing collides.

### 11.2 Project structure

```
krishichain/
├── client/src/
│   ├── pages/{public,farmer,buyer,storage,transport,admin}/
│   ├── components/   (Navbar, Sidebar, DataTable, StatCard, BidPanel)
│   ├── mock/         (batches.js, bids.js, warehouses.js, ...)  ← swap for api/ later
│   ├── context/AuthContext.js
│   └── routes/AppRouter.jsx
├── server/
│   ├── routes/ controllers/ services/ repositories/
│   └── db/pool.js
└── database/
    ├── 01_create_tables.sql
    ├── 02_sequences_triggers.sql
    ├── 03_insert_data.sql
    ├── 04_views.sql
    └── 05_advanced_queries.sql
```

### 11.3 Front-end page inventory — 15 of 28 = 54%

| Module | **Build now (Update-1)** | Defer |
|---|---|---|
| Public | Landing, Login, Register (role-select) | Forgot password |
| Farmer | Dashboard, My Farms, Create Harvest Batch, My Batches + Batch Detail, Bids on My Batch (accept winner) | Payment history, storage request |
| Buyer | Dashboard, Browse ARAT Listings, Batch Detail + Place Bid, My Bids | My orders, payment, review, complaint |
| Storage Manager | Warehouse & Units (capacity view), Allocation Requests | Allocation history, unit maintenance |
| Transport | My Assignments | Delivery status update, vehicle list |
| Admin | Dashboard (stat cards), Manage Daily Prices | Manage users, crops, ARATs, bazars, complaints, reports |

**Also required:** a role-aware Navbar/Sidebar so every built page is reachable by clicking — the faculty statement explicitly says *"proper navigation among all pages."* Deferred pages should appear in the navigation as visible but disabled "Phase 2" links so the examiner can see the full map.

**Narration script:** one page per team member listing, for each screen — what it does, which tables it reads/writes, which FR it satisfies. This is what gets asked during the walkthrough.

---

## 12. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Security | Hashed passwords; server-side role + ownership checks; bind variables on every query; least-privilege Oracle app user (never SYS/SYSTEM) |
| Data integrity | PK/FK/UNIQUE/CHECK/NOT NULL enforced at database level, not only in JavaScript |
| Performance | Connection pool created once; FK columns indexed; pagination on all list pages; list queries never select CLOB columns |
| Reliability | Every multi-table workflow wrapped in an explicit transaction with rollback |
| Usability | Responsive Bootstrap layout; consistent validation messages; loading/empty/error states on every data table |
| Maintainability | SQL isolated in `repositories/`; all DDL/DML in version-controlled `.sql` files; demo reproducible from an empty schema |

---

## 13. Testing Plan

| Level | Coverage |
|---|---|
| Constraint tests | Duplicate email, negative quantity, over-capacity allocation, bid below minimum, bid below current highest, self-bid, invalid status, ARAT self-parent |
| Transaction tests | Force a failure mid-award and confirm all four statements roll back |
| API tests | Postman collection per module (Phase 4+) |
| UI tests | Manual walkthrough of J-01 → J-07 |

**Critical acceptance cases:** T-01 register creates user + subclass atomically · T-02 duplicate email rejected · T-03 over-capacity storage rejected · T-04 bid below current highest rejected · T-05 farmer cannot bid on own batch · T-06 award creates exactly one sale order · T-07 forced rollback leaves zero orphan rows · T-08 duplicate daily price rejected · T-09 delete of user with orders blocked · T-10 hierarchy query returns correct tiers · T-11 deleting a warehouse cascades its weak storage units.

---

## 14. Seven-Day Plan to Update-1

| Day | Deliverable |
|---|---|
| **0 (do first, ~1 hour)** | **Environment proof.** Confirm XE version and `NLS_CHARACTERSET`; install Instant Client 19c; run a 5-line Node script that connects Thick-mode to `localhost:1521/XE` and selects `SYSDATE`; create the `krishichain` app user; test one virtual column. Nothing else starts until this passes on **every** member's machine |
| 1 | Redraw ER with the constructs in §7; redraw schema diagram to match |
| 2 | `01_create_tables.sql` + `02_sequences_triggers.sql` executed clean in SQL Developer |
| 3 | `03_insert_data.sql` — 5 rows × 24 tables in FK-safe order; React scaffold + auth pages |
| 4 | Advanced queries tested against seed data; farmer module pages |
| 5 | Buyer + storage + transport pages |
| 6 | Admin pages, navigation wiring, narration script |
| 7 | Full dry run, screenshots, fixes, submission pack |

**Seed-data warning.** 24 tables × 5 rows = 120 inserts, and they must be *narratively consistent* — the same 5 farmers, 5 crops, and 5 batches threading through bids, orders, transports and payments. Random data makes Q1–Q7 return empty result sets during the demo, which is the single most common way this presentation goes wrong.

**Insert order:** `USERS → USER_PHONE → FARMER/BUYER/ADMIN_STAFF/STORAGE_MANAGER/TRANSPORT_PERSONNEL → CROP_CATEGORY → CROP → FARM → VIRTUAL_ARAT (parents first, then children) → HARVEST_BATCH → WAREHOUSE → STORAGE_UNIT → STORES → BID (lowest first, so PreviousBidID resolves) → SALE_ORDER → TRANSPORT_REQUEST → VEHICLE → ASSIGNED_TO → PAYMENT → DAILY_MARKET_PRICE → PHYSICAL_BAZAR → BAZAR_DAILY_RECORD → REVIEW → COMPLAINT`

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| 11g syntax surprises (no IDENTITY, no FETCH FIRST) | Write and test all DDL on the actual lab machine by Day 2, not the night before |
| **node-oracledb Thin mode silently unusable on 11.2** | Thick mode + Instant Client 19c from day one. Prove connectivity with a 5-line `SELECT SYSDATE FROM dual` script before writing any application code |
| **32-bit / 64-bit mismatch** between XE, Instant Client and Node.js | Whole team standardizes on Windows 64-bit XE. A `DPI-1047` error means architecture mismatch, not a missing file |
| **Bengali text truncation** under byte length semantics | Declare `VARCHAR2(n CHAR)` on every text column that could hold Bengali; verify `NLS_CHARACTERSET` is `AL32UTF8` on Day 1 |
| APEX already holds port 8080 | Express on 5000 |
| Self-referencing FKs (`ParentAratID`, `PreviousBidID`) break seed inserts | Insert root ARATs and first bids with NULL, then `UPDATE` to set the links |
| Composite FK from `STORES` to weak `STORAGE_UNIT(WarehouseID, UnitNo)` | Accept it — it's the visible proof the weak entity is real. Only two tables carry it |
| Seed data too thin for analytics | Give at least 2 crops a 3-month run of daily prices so Q5's `LAG` shows a real trend |
| Scope creep from Review/Complaint/Bazar | Keep P2 — tables and seed only |
| Frontend slips because backend isn't ready | Mock data layer decouples them entirely |

---

## 16. Definition of Done for Update-1

- [ ] Finalized ER diagram showing: specialization (disjoint, total), aggregation over the bidding relationship, two ternary relationships, two weak entities, two recursive relationships, plus composite / multivalued / derived attributes
- [ ] Schema diagram matching the ER exactly
- [ ] All 24 core tables (+2 optional) created with named constraints; script runs clean on an empty schema
- [ ] 5 consistent demo rows per table
- [ ] 5 advanced queries returning non-empty, explainable results
- [ ] 15 front-end pages reachable through role-based navigation
- [ ] Every member can explain the pages and queries they own

---

*Prepared for CSE-302 DBMS Sessional, Group A6, MIST.*
