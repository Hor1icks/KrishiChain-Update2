# KrishiChain — ER Blueprint (Phase 1, Day 1)

Everything needed to redraw the ER diagram. Work from this document, not from the old hand-drawn sheet — that one predates the AUCTION removal and has none of the graded constructs.

**Notation key**

| Symbol | Meaning |
|---|---|
| `__Attr__` | Key attribute (underline it) |
| `(partial)` | Partial key of a weak entity — **dashed** underline |
| `{Attr}` | Multivalued — double ellipse |
| `/Attr/` | Derived — dashed ellipse |
| `Attr(a,b)` | Composite — sub-ellipses hanging off the parent ellipse |
| **double box** | Weak entity |
| **double diamond** | Identifying relationship |
| **double line** | Total participation |

---

## 1. Entities and attributes

### 1.1 USERS *(superclass)*
`__UserID__`, Name(First, Middle, Last), Email, PasswordHash, Gender, DateOfBirth, Address(HouseNo, Road, Village, Upazila, District, PostalCode), `{PhoneNo}`, RegistrationDate, Status, Role, `/Age/`

Two composite attributes, one multivalued, one derived — draw all four properly, they are free marks.

### 1.2 Subclasses
| Entity | Attributes |
|---|---|
| FARMER | `__FarmerID__`, NID, BankAccountNo, MobileBankingNo, ExperienceYears |
| BUYER | `__BuyerID__`, BusinessName, BuyerType, TradeLicenseNo |
| ADMIN | `__AdminID__`, EmployeeID, Designation |
| STORAGE_MANAGER | `__ManagerID__`, EmployeeID |
| TRANSPORT_PERSONNEL | `__PersonnelID__`, LicenseNo, ExperienceYears |

### 1.3 Production
| Entity | Attributes |
|---|---|
| CROP_CATEGORY | `__CategoryID__`, CategoryName, Description |
| CROP | `__CropID__`, CropName, Unit, BasePrice, ShelfLifeDays, Description |
| FARM | `__FarmID__`, FarmName, Area, SoilType, IrrigationType, Location, District, Status |
| HARVEST_BATCH | `__BatchID__`, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, `/AvailableQuantity/`, QualityGrade, MoisturePercentage, **MinimumPrice, BiddingStartTime, BiddingEndTime**, Status, `/CurrentHighestBid/` |

Two derived attributes on HARVEST_BATCH. The three bidding attributes in bold are what absorbed the deleted AUCTION entity.

### 1.4 Storage
| Entity | Attributes |
|---|---|
| WAREHOUSE | `__WarehouseID__`, WarehouseName, Address, District, Capacity, `/AvailableCapacity/` |
| **STORAGE_UNIT** *(weak)* | `(UnitNo)`, Capacity, Status, `/CurrentLoad/` |

### 1.5 Market
| Entity | Attributes |
|---|---|
| VIRTUAL_ARAT | `__AratID__`, AratName, Region, District, Address, ContactNo |
| BID | `__BidID__`, BidPricePerKg, RequestedQuantity, BidTime, Status |
| SALE_ORDER | `__SaleOrderID__`, AcceptedQuantity, AcceptedPricePerKg, `/TotalAmount/`, OrderDate, Status |
| PAYMENT | `__PaymentID__`, Amount, PaymentMethod, PaymentDate, TransactionReference, PaymentStatus |

### 1.6 Logistics
| Entity | Attributes |
|---|---|
| VEHICLE | `__VehicleID__`, VehicleNo, VehicleType, Capacity, Status |
| TRANSPORT_REQUEST | `__TransportID__`, PickupLocation, DeliveryLocation, RequestDate, DeliveryDate, DeliveryStatus |

### 1.7 Price reference
| Entity | Attributes |
|---|---|
| DAILY_MARKET_PRICE | `__CropID + AratID + PriceDate__` (composite key), PricePerKg, MinPrice, MaxPrice |
| PHYSICAL_BAZAR | `__BazarID__`, BazarName, Address, District, ContactNo |
| **BAZAR_DAILY_RECORD** *(weak)* | `(RecordDate)`, TransactionVolume, Revenue |

### 1.8 Feedback *(P2)*
| Entity | Attributes |
|---|---|
| REVIEW | `__ReviewID__`, Rating, Comment, ReviewDate |
| COMPLAINT | `__ComplaintID__`, ComplaintType, Description, Status, ResolutionDate |

---

## 2. Relationships

**Participation column:** "total" means a double line on that side.

| Relationship | Entities | Cardinality | Participation | Attributes |
|---|---|---|---|---|
| ISA (`d`) | USERS → 5 subclasses | — | **total on USERS** | — |
| belongs to | CROP → CROP_CATEGORY | N:1 | total on CROP | — |
| owns | FARMER → FARM | 1:N | total on FARM | — |
| produces | FARM → HARVEST_BATCH | 1:N | **total on HARVEST_BATCH** | — |
| appears in | CROP → HARVEST_BATCH | 1:N | total on HARVEST_BATCH | — |
| lists | VIRTUAL_ARAT → HARVEST_BATCH | 1:N | total on HARVEST_BATCH | — |
| **supervises** | VIRTUAL_ARAT → VIRTUAL_ARAT | 1:N | partial both | roles: *parent* / *child* |
| manages | STORAGE_MANAGER → WAREHOUSE | 1:N | total on WAREHOUSE | — |
| **contains** *(identifying)* | WAREHOUSE ⇒ STORAGE_UNIT | 1:N | **total on STORAGE_UNIT** | — |
| **STORES** *(ternary)* | HARVEST_BATCH × STORAGE_UNIT × STORAGE_MANAGER | M:N:P | partial | QuantityStored, DateIn, DateOut, AllocationStatus |
| places | BUYER → BID | 1:N | total on BID | — |
| on / receives | HARVEST_BATCH → BID | 1:N | **total on BID** | — |
| **outbids** | BID → BID | 1:1 | partial both | roles: *new bid* / *displaced bid* |
| **creates** *(from aggregation)* | ⟨BUYER-places-BID-on-BATCH⟩ → SALE_ORDER | 1:1 | total on SALE_ORDER | — |
| has | SALE_ORDER → PAYMENT | 1:N | total on PAYMENT | — |
| makes | BUYER → PAYMENT | 1:N | total on PAYMENT | — |
| receives | FARMER → PAYMENT | 1:N | total on PAYMENT | — |
| generates | SALE_ORDER → TRANSPORT_REQUEST | 1:1 | total on TRANSPORT_REQUEST | — |
| **ASSIGNED_TO** *(ternary)* | TRANSPORT_REQUEST × VEHICLE × TRANSPORT_PERSONNEL | M:N:P | partial | AssignedDate, AssignmentStatus |
| priced at | CROP → DAILY_MARKET_PRICE | 1:N | total on DMP | — |
| maintains | VIRTUAL_ARAT → DAILY_MARKET_PRICE | 1:N | total on DMP | — |
| logs | ADMIN → DAILY_MARKET_PRICE | 1:N | partial | — |
| **records** *(identifying)* | PHYSICAL_BAZAR ⇒ BAZAR_DAILY_RECORD | 1:N | **total on BDR** | — |
| for | BAZAR_DAILY_RECORD → CROP | N:1 | total on BDR | — |
| has | SALE_ORDER → REVIEW | 1:1 | partial | — |
| has | SALE_ORDER → COMPLAINT | 1:N | partial | — |
| handles | ADMIN → COMPLAINT | 1:N | partial | — |

---

## 3. Drawing checklist

Tick each before submitting. These are the items that carry marks.

- [ ] **Specialization** — triangle or circle containing **`d`**, **double line** from USERS to it, all five subclasses attached
- [ ] **Aggregation** — dashed rectangle enclosing `BUYER — places — BID — on — HARVEST_BATCH`; the box edge (not the BID box) connects to the `creates` diamond
- [ ] **Ternary #1** — one `STORES` diamond with exactly three lines out, and its three relationship attributes attached to the diamond, not to any entity
- [ ] **Ternary #2** — same for `ASSIGNED_TO`
- [ ] **Weak #1** — `STORAGE_UNIT` in a double box, `contains` as a double diamond, double line to WAREHOUSE, `UnitNo` **dashed**-underlined
- [ ] **Weak #2** — same pattern for `BAZAR_DAILY_RECORD` / `records` / `RecordDate`
- [ ] **Recursive #1** — `supervises` loops back to VIRTUAL_ARAT with **role labels on both edges**
- [ ] **Recursive #2** — `outbids` loops back to BID with role labels
- [ ] **Composite** — `Name` and `Address` on USERS drawn with child ellipses
- [ ] **Multivalued** — `PhoneNo` in a double ellipse
- [ ] **Derived** — six dashed ellipses: AvailableQuantity, CurrentHighestBid, CurrentLoad, AvailableCapacity, TotalAmount, Age
- [ ] **No AUCTION entity anywhere** on the sheet
- [ ] Every relationship carries a cardinality label (1, N, M, P)
- [ ] Group names and student IDs in the title block

---

## 4. Questions the examiner is likely to ask

**"Why is this aggregation and not just a relationship?"**
Because SALE_ORDER relates to the *fact that a particular buyer's bid on a particular batch won* — not to the buyer, the bid, or the batch independently. Relating it separately to each would create a path that can contradict itself.

**"Why is STORAGE_UNIT weak?"**
`UnitNo` is only unique within its warehouse. Every warehouse numbers its units from 1, so `(WarehouseID, UnitNo)` is the real identifier. Deleting a warehouse must delete its units — they have no independent existence.

**"Why is STORES ternary instead of two binary relationships?"**
Splitting it into batch–unit and manager–unit loses *which manager authorised this specific allocation*. That's the accountability record in a spoilage dispute.

**"Why did you remove AUCTION?"**
One bidding window per batch made AUCTION 1:1 with HARVEST_BATCH — a table and a join with no information content. Its attributes moved onto the batch.

**"Where is the ternary in your relational schema?"**
`STORES` and `ASSIGNED_TO` become tables carrying three foreign key sets plus their own relationship attributes.
