-- =====================================================================
-- KrishiChain | 01_create_tables.sql
-- Phase 2, Day 2 — 26 tables (24 core + 2 P2), matching the approved
-- Phase1/ER_BLUEPRINT.md and PRD v3 sections 7-9.
--
-- Run as the `krishichain` application user (never SYS/SYSTEM).
-- Run 02_sequences_triggers.sql immediately after this file — no table
-- here has a working surrogate key until that script runs.
--
-- Naming: PK_ / FK_ / UQ_ / CK_ / IX_ prefixes throughout, per PRD 9.9.
-- Text columns that may hold Bengali use VARCHAR2(n CHAR) explicitly.
--
-- Two schema notes carried over from this phase's design decisions —
-- see context.md "Schema deltas" if these don't match your diagram 1:1:
--   1. SALE_ORDER.PaymentTerms is a NEW column (ADVANCE / ON_DELIVERY)
--      added to implement "payment can be flexible, depends on both
--      parties" — BR-20 is no longer a blanket rule, it is conditional
--      on this flag (enforced in 02_sequences_triggers.sql).
--   2. USERS./Age/ is NOT a stored or virtual column. Oracle 11g virtual
--      columns reject non-deterministic expressions (SYSDATE), so Age
--      is computed in a view instead (Phase 4, 04_views.sql).
-- =====================================================================

-- =====================================================================
-- SECTION 0 - USER-DEFINED TYPES
--
-- t_address is an abstract data type: the six address fields are one
-- thing, not six, and the type carries member functions so the object
-- knows how to format itself. USERS.Address below is a column of it.
--
-- Attribute access from SQL needs a table alias: u.Address.District is
-- legal, Address.District is not.
-- =====================================================================

CREATE OR REPLACE TYPE t_address AS OBJECT (
  HouseNo     VARCHAR2(30  CHAR),
  Road        VARCHAR2(60  CHAR),
  Village     VARCHAR2(100 CHAR),
  Upazila     VARCHAR2(100 CHAR),
  District    VARCHAR2(100 CHAR),
  PostalCode  VARCHAR2(10  CHAR),

  MEMBER FUNCTION full_text   RETURN VARCHAR2,
  MEMBER FUNCTION short_text  RETURN VARCHAR2
) NOT FINAL;
/

CREATE OR REPLACE TYPE BODY t_address AS

  -- NVL2 is a SQL function and is not available inside PL/SQL
  -- (PLS-00201), so the optional parts are handled with CASE.

  -- The whole address on one line. LTRIM removes the separator left
  -- behind when the optional leading parts are NULL.
  MEMBER FUNCTION full_text RETURN VARCHAR2 IS
  BEGIN
    RETURN LTRIM(
      CASE WHEN HouseNo    IS NOT NULL THEN ', ' || HouseNo    END ||
      CASE WHEN Road       IS NOT NULL THEN ', ' || Road       END ||
      CASE WHEN Village    IS NOT NULL THEN ', ' || Village    END ||
      CASE WHEN Upazila    IS NOT NULL THEN ', ' || Upazila    END ||
      ', ' || District ||
      CASE WHEN PostalCode IS NOT NULL THEN ' - ' || PostalCode END,
      ', ');
  END full_text;

  -- Upazila and district only, for list screens where the full address
  -- would not fit.
  MEMBER FUNCTION short_text RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN Upazila IS NOT NULL THEN Upazila || ', ' END || District;
  END short_text;

END;
/


-- =====================================================================
-- SECTION 1 — IDENTITY AND SPECIALIZATION
-- =====================================================================

CREATE TABLE USERS (
  UserID           NUMBER(10)          NOT NULL,
  FirstName        VARCHAR2(50 CHAR)   NOT NULL,
  MiddleName       VARCHAR2(50 CHAR),
  LastName         VARCHAR2(50 CHAR)   NOT NULL,
  Email            VARCHAR2(100 CHAR)  NOT NULL,
  PasswordHash     VARCHAR2(255 CHAR)  NOT NULL,
  Gender           CHAR(1)             NOT NULL,
  DateOfBirth      DATE                NOT NULL,
  Address          t_address           NOT NULL,
  RegistrationDate DATE                DEFAULT SYSDATE NOT NULL,
  Status           VARCHAR2(10 CHAR)   DEFAULT 'ACTIVE' NOT NULL,
  Role             VARCHAR2(20 CHAR)   NOT NULL,
  CONSTRAINT PK_USERS PRIMARY KEY (UserID),
  CONSTRAINT UQ_USERS_EMAIL UNIQUE (Email),
  CONSTRAINT CK_USERS_GENDER CHECK (Gender IN ('M','F','O')),
  -- District was NOT NULL as a column; as an object attribute that
  -- has to be expressed as a table-level CHECK instead.
  CONSTRAINT CK_USERS_DISTRICT CHECK ("ADDRESS"."DISTRICT" IS NOT NULL),
  CONSTRAINT CK_USERS_STATUS CHECK (Status IN ('ACTIVE','BLOCKED','INACTIVE')),
  CONSTRAINT CK_USERS_ROLE CHECK (Role IN ('FARMER','BUYER','ADMIN','STORAGE_MANAGER','TRANSPORT_PERSONNEL'))
);

-- Multivalued attribute {PhoneNo}
CREATE TABLE USER_PHONE (
  UserID   NUMBER(10)        NOT NULL,
  PhoneNo  VARCHAR2(20 CHAR) NOT NULL,
  CONSTRAINT PK_USER_PHONE PRIMARY KEY (UserID, PhoneNo),
  CONSTRAINT FK_USERPHONE_USERS FOREIGN KEY (UserID)
    REFERENCES USERS (UserID) ON DELETE CASCADE,
  CONSTRAINT UQ_USER_PHONE_NO UNIQUE (PhoneNo)
);

-- ISA subclasses: PK is also FK -> USERS (shared-PK specialization, D-3).
-- No sequence/trigger — the app inserts FarmerID/BuyerID/etc. equal to
-- the UserID just generated for the parent USERS row, in one transaction.

CREATE TABLE FARMER (
  FarmerID         NUMBER(10)         NOT NULL,
  NID              VARCHAR2(20 CHAR)  NOT NULL,
  BankAccountNo    VARCHAR2(30 CHAR),
  MobileBankingNo  VARCHAR2(20 CHAR),
  ExperienceYears  NUMBER(3),
  CONSTRAINT PK_FARMER PRIMARY KEY (FarmerID),
  CONSTRAINT FK_FARMER_USERS FOREIGN KEY (FarmerID) REFERENCES USERS (UserID) ON DELETE CASCADE,
  CONSTRAINT UQ_FARMER_NID UNIQUE (NID),
  CONSTRAINT CK_FARMER_EXPERIENCE CHECK (ExperienceYears >= 0)
);

CREATE TABLE BUYER (
  BuyerID         NUMBER(10)          NOT NULL,
  BusinessName    VARCHAR2(150 CHAR),
  BuyerType       VARCHAR2(20 CHAR),
  TradeLicenseNo  VARCHAR2(30 CHAR),
  CONSTRAINT PK_BUYER PRIMARY KEY (BuyerID),
  CONSTRAINT FK_BUYER_USERS FOREIGN KEY (BuyerID) REFERENCES USERS (UserID) ON DELETE CASCADE,
  CONSTRAINT UQ_BUYER_LICENSE UNIQUE (TradeLicenseNo),
  CONSTRAINT CK_BUYER_TYPE CHECK (BuyerType IN ('WHOLESALER','RETAILER','EXPORTER','PROCESSOR'))
);

CREATE TABLE ADMIN_STAFF (
  AdminID      NUMBER(10)         NOT NULL,
  EmployeeID   VARCHAR2(20 CHAR)  NOT NULL,
  Designation  VARCHAR2(50 CHAR),
  CONSTRAINT PK_ADMIN_STAFF PRIMARY KEY (AdminID),
  CONSTRAINT FK_ADMIN_USERS FOREIGN KEY (AdminID) REFERENCES USERS (UserID) ON DELETE CASCADE,
  CONSTRAINT UQ_ADMIN_EMPLOYEEID UNIQUE (EmployeeID)
);

CREATE TABLE STORAGE_MANAGER (
  ManagerID        NUMBER(10)        NOT NULL,
  EmployeeID       VARCHAR2(20 CHAR) NOT NULL,
  Designation      VARCHAR2(50 CHAR) NOT NULL,
  HireDate         DATE              NOT NULL,
  ShiftSchedule    VARCHAR2(20 CHAR),
  CertificationNo  VARCHAR2(30 CHAR),
  CONSTRAINT PK_STORAGE_MANAGER PRIMARY KEY (ManagerID),
  CONSTRAINT FK_MANAGER_USERS FOREIGN KEY (ManagerID)
    REFERENCES USERS (UserID) ON DELETE CASCADE,
  CONSTRAINT UQ_MANAGER_EMPLOYEEID UNIQUE (EmployeeID),
  CONSTRAINT UQ_MANAGER_CERT UNIQUE (CertificationNo),
  CONSTRAINT CK_MANAGER_SHIFT CHECK (ShiftSchedule IN ('DAY','NIGHT','ROTATING'))
);

CREATE TABLE TRANSPORT_PERSONNEL (
  PersonnelID      NUMBER(10)         NOT NULL,
  LicenseNo        VARCHAR2(30 CHAR)  NOT NULL,
  ExperienceYears  NUMBER(3),
  CONSTRAINT PK_TRANSPORT_PERSONNEL PRIMARY KEY (PersonnelID),
  CONSTRAINT FK_PERSONNEL_USERS FOREIGN KEY (PersonnelID) REFERENCES USERS (UserID) ON DELETE CASCADE,
  CONSTRAINT UQ_PERSONNEL_LICENSE UNIQUE (LicenseNo),
  CONSTRAINT CK_PERSONNEL_EXPERIENCE CHECK (ExperienceYears >= 0)
);

-- =====================================================================
-- SECTION 2 — PRODUCTION AND MARKET LISTING
-- =====================================================================

CREATE TABLE CROP_CATEGORY (
  CategoryID    NUMBER(10)          NOT NULL,
  CategoryName  VARCHAR2(80 CHAR)   NOT NULL,
  Description   CLOB,
  CONSTRAINT PK_CROP_CATEGORY PRIMARY KEY (CategoryID),
  CONSTRAINT UQ_CROP_CATEGORY_NAME UNIQUE (CategoryName)
);

CREATE TABLE CROP (
  CropID         NUMBER(10)          NOT NULL,
  CropName       VARCHAR2(100 CHAR)  NOT NULL,
  CategoryID     NUMBER(10)          NOT NULL,
  Unit           VARCHAR2(20 CHAR)   NOT NULL,
  BasePrice      NUMBER(12,2)        NOT NULL,
  ShelfLifeDays  NUMBER(5),
  Description    CLOB,
  CONSTRAINT PK_CROP PRIMARY KEY (CropID),
  CONSTRAINT FK_CROP_CATEGORY FOREIGN KEY (CategoryID) REFERENCES CROP_CATEGORY (CategoryID),
  CONSTRAINT UQ_CROP_NAME UNIQUE (CropName),
  CONSTRAINT CK_CROP_BASEPRICE CHECK (BasePrice > 0),
  CONSTRAINT CK_CROP_SHELFLIFE CHECK (ShelfLifeDays >= 0)
);

CREATE TABLE FARM (
  FarmID          NUMBER(10)          NOT NULL,
  FarmerID        NUMBER(10)          NOT NULL,
  FarmName        VARCHAR2(100 CHAR)  NOT NULL,
  Area            NUMBER(10,2)        NOT NULL,
  SoilType        VARCHAR2(50 CHAR),
  IrrigationType  VARCHAR2(50 CHAR),
  Location        VARCHAR2(150 CHAR),
  District        VARCHAR2(100 CHAR)  NOT NULL,
  Status          VARCHAR2(15 CHAR)   DEFAULT 'ACTIVE' NOT NULL,
  CONSTRAINT PK_FARM PRIMARY KEY (FarmID),
  CONSTRAINT FK_FARM_FARMER FOREIGN KEY (FarmerID) REFERENCES FARMER (FarmerID) ON DELETE CASCADE,
  CONSTRAINT CK_FARM_AREA CHECK (Area > 0),
  CONSTRAINT CK_FARM_STATUS CHECK (Status IN ('ACTIVE','INACTIVE'))
);

-- Recursive relationship: supervises (ParentAratID -> AratID)
CREATE TABLE VIRTUAL_ARAT (
  AratID        NUMBER(10)          NOT NULL,
  AratName      VARCHAR2(100 CHAR)  NOT NULL,
  Region        VARCHAR2(80 CHAR),
  District      VARCHAR2(100 CHAR)  NOT NULL,
  Address       VARCHAR2(200 CHAR),
  ContactNo     VARCHAR2(20 CHAR),
  ParentAratID  NUMBER(10),
  CONSTRAINT PK_VIRTUAL_ARAT PRIMARY KEY (AratID),
  CONSTRAINT FK_ARAT_PARENT FOREIGN KEY (ParentAratID) REFERENCES VIRTUAL_ARAT (AratID) ON DELETE SET NULL,
  CONSTRAINT CK_ARAT_NOT_OWN_PARENT CHECK (ParentAratID <> AratID)
);

-- AUCTION entity removed (D-4) — bidding-window attributes live here.
CREATE TABLE HARVEST_BATCH (
  BatchID             NUMBER(10)          NOT NULL,
  FarmID              NUMBER(10)          NOT NULL,
  CropID              NUMBER(10)          NOT NULL,
  AratID              NUMBER(10)          NOT NULL,
  HarvestDate         DATE                NOT NULL,
  TotalQuantity       NUMBER(12,3)        NOT NULL,
  ReservedQuantity    NUMBER(12,3)        DEFAULT 0 NOT NULL,
  SoldQuantity        NUMBER(12,3)        DEFAULT 0 NOT NULL,
  AvailableQuantity   NUMBER(12,3) GENERATED ALWAYS AS (TotalQuantity - ReservedQuantity - SoldQuantity) VIRTUAL,
  QualityGrade        CHAR(1),
  MoisturePercentage  NUMBER(5,2),
  MinimumPrice        NUMBER(12,2),
  BiddingStartTime    TIMESTAMP,
  BiddingEndTime      TIMESTAMP,
  Status              VARCHAR2(20 CHAR)   DEFAULT 'CREATED' NOT NULL,
  -- Farmer-set floor on any single bid's RequestedQuantity, added with
  -- the feedback-batch migration (07_bid_storage_transport_notifications.sql).
  -- Enforced here by CK_BATCH_MINBIDQTY (same-table, so a plain CHECK
  -- suffices) and against BID.RequestedQuantity by trg_bid_min_qty in
  -- 02_sequences_triggers.sql (cross-table, needs a trigger).
  MinimumBidQuantity  NUMBER(12,3)        NOT NULL,
  CONSTRAINT PK_HARVEST_BATCH PRIMARY KEY (BatchID),
  CONSTRAINT FK_BATCH_FARM FOREIGN KEY (FarmID) REFERENCES FARM (FarmID) ON DELETE CASCADE,
  CONSTRAINT FK_BATCH_CROP FOREIGN KEY (CropID) REFERENCES CROP (CropID),
  CONSTRAINT FK_BATCH_ARAT FOREIGN KEY (AratID) REFERENCES VIRTUAL_ARAT (AratID),
  CONSTRAINT CK_BATCH_TOTALQTY CHECK (TotalQuantity > 0),
  CONSTRAINT CK_BATCH_RESERVEDQTY CHECK (ReservedQuantity >= 0),
  CONSTRAINT CK_BATCH_SOLDQTY CHECK (SoldQuantity >= 0),
  CONSTRAINT CK_BATCH_AVAILABLE CHECK (TotalQuantity - ReservedQuantity - SoldQuantity >= 0),
  CONSTRAINT CK_BATCH_GRADE CHECK (QualityGrade IN ('A','B','C')),
  CONSTRAINT CK_BATCH_MOISTURE CHECK (MoisturePercentage BETWEEN 0 AND 100),
  CONSTRAINT CK_BATCH_MINPRICE CHECK (MinimumPrice > 0),
  CONSTRAINT CK_BATCH_BIDWINDOW CHECK (BiddingStartTime IS NULL OR BiddingEndTime IS NULL OR BiddingEndTime > BiddingStartTime),
  CONSTRAINT CK_BATCH_STATUS CHECK (Status IN ('CREATED','STORED','LISTED','BIDDING_OPEN','BIDDING_CLOSED','SOLD','DELIVERED','EXPIRED')),
  CONSTRAINT CK_BATCH_MINBIDQTY CHECK (MinimumBidQuantity > 0 AND MinimumBidQuantity <= TotalQuantity)
);

-- =====================================================================
-- SECTION 3 — STORAGE
-- =====================================================================

-- StorageFeePerKgRate added post-Phase-5 (database/06_storage_workflow.sql)
-- — not on the original ER diagram, same class of delta as
-- SALE_ORDER.PaymentTerms. Bangladesh cold storage charges a flat
-- per-kg, per-season fee at intake (BDT ~7-8/kg for potato, 2024-25),
-- not a daily/monthly rent — this is that rate, set by the warehouse's
-- own manager.
CREATE TABLE WAREHOUSE (
  WarehouseID          NUMBER(10)          NOT NULL,
  WarehouseName        VARCHAR2(100 CHAR)  NOT NULL,
  Address              VARCHAR2(200 CHAR),
  District             VARCHAR2(100 CHAR)  NOT NULL,
  Capacity             NUMBER(12,3)        NOT NULL,
  ManagerID            NUMBER(10)          NOT NULL,
  StorageFeePerKgRate  NUMBER(10,2),
  CONSTRAINT PK_WAREHOUSE PRIMARY KEY (WarehouseID),
  CONSTRAINT FK_WAREHOUSE_MANAGER FOREIGN KEY (ManagerID) REFERENCES STORAGE_MANAGER (ManagerID),
  CONSTRAINT CK_WAREHOUSE_CAPACITY CHECK (Capacity > 0),
  CONSTRAINT CK_WAREHOUSE_FEE_RATE CHECK (StorageFeePerKgRate IS NULL OR StorageFeePerKgRate > 0)
);

-- Weak entity #1: identified by WAREHOUSE. UnitNo (partial key) is
-- assigned per-warehouse by trg_storage_unit_no in 02_sequences_triggers.sql
-- (NOT a global sequence — it must restart at 1 for every warehouse).
CREATE TABLE STORAGE_UNIT (
  WarehouseID  NUMBER(10)        NOT NULL,
  UnitNo       NUMBER(5)         NOT NULL,
  Capacity     NUMBER(12,3)      NOT NULL,
  Status       VARCHAR2(15 CHAR) DEFAULT 'EMPTY' NOT NULL,
  CONSTRAINT PK_STORAGE_UNIT PRIMARY KEY (WarehouseID, UnitNo),
  CONSTRAINT FK_UNIT_WAREHOUSE FOREIGN KEY (WarehouseID)
    REFERENCES WAREHOUSE (WarehouseID) ON DELETE CASCADE,
  CONSTRAINT CK_UNIT_CAPACITY CHECK (Capacity > 0),
  CONSTRAINT CK_UNIT_STATUS CHECK (Status IN ('EMPTY','PARTIAL','FULL','MAINTENANCE'))
);

-- Ternary #1: HARVEST_BATCH x STORAGE_UNIT x STORAGE_MANAGER
--
-- CONSENT WORKFLOW AND TWO-LEG STORAGE, added post-Phase-5
-- (database/06_storage_workflow.sql) — not on the original ER diagram.
-- A batch can sit in storage twice over its life, same table, same
-- ternary, just a second row when it applies:
--   LEG 1 (pre-sale)  — the farmer's local storage. Customer = FARMER.
--                        BatchID set, SaleOrderID NULL.
--   LEG 2 (post-sale) — the buyer's local storage, once bought and
--                        moving toward them. Customer = BUYER (the
--                        winning bidder). BatchID AND SaleOrderID set.
-- Exactly one of RequestedByFarmerID/RequestedByBuyerID is set
-- (CK_STORES_CUSTOMER) — that is who must consent, both to accept the
-- manager's proposal and to release from it.
--
-- DateIn is nullable: a PENDING_ACCEPT row is a proposal only — the
-- batch is not physically in storage, and the clock has not started,
-- until the customer accepts. AllocationStatus flows:
--   PENDING_ACCEPT -> ACTIVE -> PENDING_RELEASE -> COMPLETED
--                  \-> REJECTED           (customer declined)
--                  \-> CANCELLED          (manager withdrew, unaccepted)
-- Release itself forks on MinimumReleaseDate (DateIn + MinimumStorageDays,
-- the manager's committed term): once fulfilled, either party releases
-- directly; before it, the OTHER party must explicitly approve — see
-- server/src/services/storage.service.js.
CREATE TABLE STORES (
  AllocationID            NUMBER(10)        NOT NULL,
  BatchID                 NUMBER(10)        NOT NULL,
  WarehouseID             NUMBER(10)        NOT NULL,
  UnitNo                  NUMBER(5)         NOT NULL,
  ManagerID               NUMBER(10)        NOT NULL,
  QuantityStored          NUMBER(12,3)      NOT NULL,
  DateIn                  DATE,
  DateOut                 DATE,
  AllocationStatus        VARCHAR2(15 CHAR) DEFAULT 'PENDING_ACCEPT' NOT NULL,
  RequestedByFarmerID     NUMBER(10),
  RequestedByBuyerID      NUMBER(10),
  SaleOrderID             NUMBER(10),
  MinimumStorageDays      NUMBER(5),
  MinimumReleaseDate      DATE GENERATED ALWAYS AS (DateIn + MinimumStorageDays) VIRTUAL,
  StorageFeePerKgSnapshot NUMBER(10,2),
  StorageFee              NUMBER(12,2) GENERATED ALWAYS AS (QuantityStored * StorageFeePerKgSnapshot) VIRTUAL,
  ReleaseRequestedBy      VARCHAR2(10),
  -- Negotiation, added with the feedback-batch migration. ProposedBy
  -- records who created the row (a manager proposing, or a customer
  -- requesting via storage.service.js requestAllocation()) -- the OTHER
  -- side must respond (assertIsResponder()). A single counter-offer round
  -- is allowed: CounterRatePerKg/CounteredBy are set when either side
  -- counters, and only the ORIGINAL proposer may then Accept/Reject the
  -- counter (respondToCounter()) -- no re-countering.
  ProposedBy              VARCHAR2(10)      NOT NULL,
  CounterRatePerKg        NUMBER(10,2),
  CounteredBy             VARCHAR2(10),
  CONSTRAINT PK_STORES PRIMARY KEY (AllocationID),
  CONSTRAINT FK_STORES_BATCH FOREIGN KEY (BatchID) REFERENCES HARVEST_BATCH (BatchID) ON DELETE CASCADE,
  CONSTRAINT FK_STORES_UNIT FOREIGN KEY (WarehouseID, UnitNo) REFERENCES STORAGE_UNIT (WarehouseID, UnitNo),
  CONSTRAINT FK_STORES_MANAGER FOREIGN KEY (ManagerID) REFERENCES STORAGE_MANAGER (ManagerID),
  CONSTRAINT FK_STORES_REQ_FARMER FOREIGN KEY (RequestedByFarmerID) REFERENCES FARMER (FarmerID),
  CONSTRAINT FK_STORES_REQ_BUYER FOREIGN KEY (RequestedByBuyerID) REFERENCES BUYER (BuyerID),
  -- FK_STORES_SALE_ORDER is NOT declared here: SALE_ORDER (Section 4)
  -- does not exist yet at this point in the script. Added via ALTER
  -- TABLE right after SALE_ORDER is created, below.
  CONSTRAINT UQ_STORES_ALLOCATION UNIQUE (BatchID, WarehouseID, UnitNo, DateIn),
  CONSTRAINT CK_STORES_QTY CHECK (QuantityStored > 0),
  CONSTRAINT CK_STORES_DATES CHECK (DateOut IS NULL OR DateOut >= DateIn),
  CONSTRAINT CK_STORES_STATUS CHECK (AllocationStatus IN
    ('PENDING_ACCEPT','ACTIVE','PENDING_RELEASE','COMPLETED','REJECTED','CANCELLED','COUNTERED')),
  CONSTRAINT CK_STORES_CUSTOMER CHECK (
    (RequestedByFarmerID IS NOT NULL AND RequestedByBuyerID IS NULL) OR
    (RequestedByFarmerID IS NULL AND RequestedByBuyerID IS NOT NULL)),
  CONSTRAINT CK_STORES_MINDAYS CHECK (MinimumStorageDays IS NULL OR MinimumStorageDays > 0),
  CONSTRAINT CK_STORES_RELEASE_BY CHECK (ReleaseRequestedBy IS NULL OR ReleaseRequestedBy IN ('FARMER','BUYER','MANAGER')),
  CONSTRAINT CK_STORES_PROPOSEDBY CHECK (ProposedBy IN ('MANAGER','CUSTOMER')),
  CONSTRAINT CK_STORES_COUNTERRATE CHECK (CounterRatePerKg IS NULL OR CounterRatePerKg > 0),
  CONSTRAINT CK_STORES_COUNTEREDBY CHECK (CounteredBy IS NULL OR CounteredBy IN ('MANAGER','CUSTOMER'))
);

-- =====================================================================
-- SECTION 4 — BIDDING, SALE AND PAYMENT
-- =====================================================================

-- Recursive relationship: outbids (PreviousBidID -> BidID)
CREATE TABLE BID (
  BidID              NUMBER(10)        NOT NULL,
  BatchID            NUMBER(10)        NOT NULL,
  BuyerID            NUMBER(10)        NOT NULL,
  BidPricePerKg      NUMBER(12,2)      NOT NULL,
  RequestedQuantity  NUMBER(12,3)      NOT NULL,
  BidTime            TIMESTAMP         DEFAULT SYSTIMESTAMP NOT NULL,
  Status             VARCHAR2(15 CHAR) DEFAULT 'ACTIVE' NOT NULL,
  PreviousBidID      NUMBER(10),
  CONSTRAINT PK_BID PRIMARY KEY (BidID),
  CONSTRAINT FK_BID_BATCH FOREIGN KEY (BatchID) REFERENCES HARVEST_BATCH (BatchID) ON DELETE CASCADE,
  CONSTRAINT FK_BID_BUYER FOREIGN KEY (BuyerID) REFERENCES BUYER (BuyerID),
  CONSTRAINT FK_BID_PREVIOUS FOREIGN KEY (PreviousBidID) REFERENCES BID (BidID) ON DELETE SET NULL,
  CONSTRAINT CK_BID_PRICE CHECK (BidPricePerKg > 0),
  CONSTRAINT CK_BID_QTY CHECK (RequestedQuantity > 0),
  CONSTRAINT CK_BID_STATUS CHECK (Status IN ('ACTIVE','OUTBID','WON','WITHDRAWN')),
  CONSTRAINT CK_BID_NOT_OWN_PREVIOUS CHECK (PreviousBidID <> BidID)
);

-- Aggregation result: (BUYER-places-BID-on-HARVEST_BATCH) -> creates -> SALE_ORDER
-- PaymentTerms is this phase's addition for the "payment can be flexible"
-- decision — see header note and context.md.
CREATE TABLE SALE_ORDER (
  SaleOrderID         NUMBER(10)        NOT NULL,
  BidID               NUMBER(10)        NOT NULL,
  AcceptedQuantity    NUMBER(12,3)      NOT NULL,
  AcceptedPricePerKg  NUMBER(12,2)      NOT NULL,
  TotalAmount         NUMBER(14,2) GENERATED ALWAYS AS (AcceptedQuantity * AcceptedPricePerKg) VIRTUAL,
  OrderDate           DATE              DEFAULT SYSDATE NOT NULL,
  Status              VARCHAR2(15 CHAR) DEFAULT 'CONFIRMED' NOT NULL,
  PaymentTerms        VARCHAR2(15 CHAR) DEFAULT 'ON_DELIVERY' NOT NULL,
  -- Added with the feedback-batch migration: a transport request is not
  -- claimable (transport.service.js listOpenRequests()/claim()) until the
  -- buyer has made an explicit choice here. 'VIA_STORAGE' is set
  -- automatically -- never by direct user action -- the moment a leg-2
  -- STORES allocation for this order reaches ACTIVE (storage.service.js
  -- finalizeAcceptance()). 'DIRECT' is set explicitly by the buyer via
  -- POST /buyer/orders/:saleOrderId/delivery-preference.
  DeliveryPreference  VARCHAR2(15 CHAR) DEFAULT 'PENDING' NOT NULL,
  CONSTRAINT PK_SALE_ORDER PRIMARY KEY (SaleOrderID),
  CONSTRAINT FK_ORDER_BID FOREIGN KEY (BidID) REFERENCES BID (BidID) ON DELETE CASCADE,
  CONSTRAINT UQ_ORDER_BID UNIQUE (BidID),
  CONSTRAINT CK_ORDER_QTY CHECK (AcceptedQuantity > 0),
  CONSTRAINT CK_ORDER_PRICE CHECK (AcceptedPricePerKg > 0),
  CONSTRAINT CK_ORDER_STATUS CHECK (Status IN ('CONFIRMED','IN_TRANSIT','COMPLETED','CANCELLED')),
  CONSTRAINT CK_ORDER_TERMS CHECK (PaymentTerms IN ('ADVANCE','ON_DELIVERY')),
  CONSTRAINT CK_ORDER_DELIVERY_PREF CHECK (DeliveryPreference IN ('PENDING','DIRECT','VIA_STORAGE'))
);

-- Deferred from STORES's own CREATE TABLE in Section 3 -- SALE_ORDER
-- did not exist yet at that point. SaleOrderID on STORES is set only
-- for leg-2 (post-sale, buyer's local storage) allocations.
ALTER TABLE STORES ADD CONSTRAINT FK_STORES_SALE_ORDER
  FOREIGN KEY (SaleOrderID) REFERENCES SALE_ORDER (SaleOrderID);

-- PAYMENT covers both kinds of money in the system, told apart by the
-- PaymentType discriminator:
--
--   SALE     buyer -> farmer for a sale order. Direct, no ARAT
--            commission and no escrow (D-2), so both parties appear.
--   STORAGE  the fee owed for a STORES allocation.
--
-- The STORAGE branch is the AGGREGATION made concrete: the fee is not
-- owed for a batch, or a unit, or to a manager, but for the allocation
-- -- the three-way fact as a whole. Hence AllocationID and nothing
-- else; the payer (farmer for leg 1, buyer for leg 2) is derivable
-- through STORES.
--
-- Kept as ONE table with a discriminator rather than separate subclass
-- tables, unlike the USERS specialization: the USERS subtypes each
-- carry several attributes of their own and earn a table, whereas these
-- two differ by one or two columns. CK_PAYMENT_TYPE_SHAPE below is what
-- stops the nullable columns being filled in nonsensically.
CREATE TABLE PAYMENT (
  PaymentID             NUMBER(10)        NOT NULL,
  PaymentType           VARCHAR2(10 CHAR) DEFAULT 'SALE' NOT NULL,
  SaleOrderID           NUMBER(10),
  BuyerID               NUMBER(10),
  FarmerID              NUMBER(10),
  AllocationID          NUMBER(10),
  Amount                NUMBER(12,2)      NOT NULL,
  PaymentMethod         VARCHAR2(20 CHAR) NOT NULL,
  PaymentDate           DATE              DEFAULT SYSDATE NOT NULL,
  TransactionReference  VARCHAR2(50 CHAR) NOT NULL,
  PaymentStatus         VARCHAR2(15 CHAR) DEFAULT 'PENDING' NOT NULL,
  CONSTRAINT PK_PAYMENT PRIMARY KEY (PaymentID),
  CONSTRAINT FK_PAYMENT_ORDER FOREIGN KEY (SaleOrderID)
    REFERENCES SALE_ORDER (SaleOrderID) ON DELETE CASCADE,
  CONSTRAINT FK_PAYMENT_BUYER FOREIGN KEY (BuyerID) REFERENCES BUYER (BuyerID),
  CONSTRAINT FK_PAYMENT_FARMER FOREIGN KEY (FarmerID) REFERENCES FARMER (FarmerID),
  CONSTRAINT FK_PAYMENT_ALLOCATION FOREIGN KEY (AllocationID)
    REFERENCES STORES (AllocationID) ON DELETE CASCADE,
  CONSTRAINT UQ_PAYMENT_REFERENCE UNIQUE (TransactionReference),
  CONSTRAINT CK_PAYMENT_AMOUNT CHECK (Amount > 0),
  CONSTRAINT CK_PAYMENT_TYPE CHECK (PaymentType IN ('SALE','STORAGE')),
  CONSTRAINT CK_PAYMENT_STATUS CHECK (PaymentStatus IN ('PENDING','COMPLETED','FAILED','REFUNDED')),
  -- The discriminator alone would allow a nonsense row. This is what
  -- actually enforces each subtype's shape: a SALE payment settles a
  -- sale order between a buyer and a farmer, a STORAGE payment settles
  -- a STORES allocation and involves neither.
  CONSTRAINT CK_PAYMENT_TYPE_SHAPE CHECK (
    (PaymentType = 'SALE'
       AND SaleOrderID  IS NOT NULL
       AND BuyerID      IS NOT NULL
       AND FarmerID     IS NOT NULL
       AND AllocationID IS NULL)
    OR
    (PaymentType = 'STORAGE'
       AND AllocationID IS NOT NULL
       AND SaleOrderID  IS NULL
       AND BuyerID      IS NULL
       AND FarmerID     IS NULL))
);

-- =====================================================================
-- SECTION 5 — LOGISTICS
-- =====================================================================

CREATE TABLE VEHICLE (
  VehicleID    NUMBER(10)        NOT NULL,
  VehicleNo    VARCHAR2(20 CHAR) NOT NULL,
  VehicleType  VARCHAR2(30 CHAR),
  Capacity     NUMBER(12,3)      NOT NULL,
  Status       VARCHAR2(15 CHAR) DEFAULT 'AVAILABLE' NOT NULL,
  CONSTRAINT PK_VEHICLE PRIMARY KEY (VehicleID),
  CONSTRAINT UQ_VEHICLE_NO UNIQUE (VehicleNo),
  CONSTRAINT CK_VEHICLE_CAPACITY CHECK (Capacity > 0),
  CONSTRAINT CK_VEHICLE_STATUS CHECK (Status IN ('AVAILABLE','ASSIGNED','MAINTENANCE'))
);

CREATE TABLE TRANSPORT_REQUEST (
  TransportID       NUMBER(10)        NOT NULL,
  SaleOrderID       NUMBER(10)        NOT NULL,
  PickupLocation    VARCHAR2(200 CHAR),
  DeliveryLocation  VARCHAR2(200 CHAR),
  RequestDate       DATE              DEFAULT SYSDATE NOT NULL,
  DeliveryDate      DATE,
  DeliveryStatus    VARCHAR2(15 CHAR) DEFAULT 'PENDING' NOT NULL,
  CONSTRAINT PK_TRANSPORT_REQUEST PRIMARY KEY (TransportID),
  CONSTRAINT FK_TRANSPORT_ORDER FOREIGN KEY (SaleOrderID) REFERENCES SALE_ORDER (SaleOrderID) ON DELETE CASCADE,
  CONSTRAINT UQ_TRANSPORT_ORDER UNIQUE (SaleOrderID),
  CONSTRAINT CK_TRANSPORT_STATUS CHECK (DeliveryStatus IN ('PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','FAILED'))
);

-- Ternary #2: TRANSPORT_REQUEST x VEHICLE x TRANSPORT_PERSONNEL
-- A request belongs to one transport person, who may use several of
-- their own vehicles. trg_assigned_one_personnel enforces the first
-- half of that; UQ_ASSIGNED_VEHICLE the second.
CREATE TABLE ASSIGNED_TO (
  AssignmentID      NUMBER(10)        NOT NULL,
  TransportID       NUMBER(10)        NOT NULL,
  VehicleID         NUMBER(10)        NOT NULL,
  PersonnelID       NUMBER(10)        NOT NULL,
  AssignedDate      DATE              DEFAULT SYSDATE NOT NULL,
  AssignmentStatus  VARCHAR2(15 CHAR) DEFAULT 'ACTIVE' NOT NULL,
  CONSTRAINT PK_ASSIGNED_TO PRIMARY KEY (AssignmentID),
  CONSTRAINT FK_ASSIGNED_TRANSPORT FOREIGN KEY (TransportID) REFERENCES TRANSPORT_REQUEST (TransportID) ON DELETE CASCADE,
  CONSTRAINT FK_ASSIGNED_VEHICLE FOREIGN KEY (VehicleID) REFERENCES VEHICLE (VehicleID),
  CONSTRAINT FK_ASSIGNED_PERSONNEL FOREIGN KEY (PersonnelID) REFERENCES TRANSPORT_PERSONNEL (PersonnelID),
  CONSTRAINT UQ_ASSIGNED_VEHICLE UNIQUE (TransportID, VehicleID),
  CONSTRAINT CK_ASSIGNED_STATUS CHECK (AssignmentStatus IN ('ACTIVE','COMPLETED','CANCELLED'))
);

-- =====================================================================
-- SECTION 6 — PRICE REFERENCE
-- =====================================================================

CREATE TABLE DAILY_MARKET_PRICE (
  CropID      NUMBER(10)    NOT NULL,
  AratID      NUMBER(10)    NOT NULL,
  PriceDate   DATE          NOT NULL,
  PricePerKg  NUMBER(12,2)  NOT NULL,
  MinPrice    NUMBER(12,2)  NOT NULL,
  MaxPrice    NUMBER(12,2)  NOT NULL,
  LoggedBy    NUMBER(10)    NOT NULL,
  CONSTRAINT PK_DAILY_MARKET_PRICE PRIMARY KEY (CropID, AratID, PriceDate),
  CONSTRAINT FK_DMP_CROP FOREIGN KEY (CropID) REFERENCES CROP (CropID),
  CONSTRAINT FK_DMP_ARAT FOREIGN KEY (AratID) REFERENCES VIRTUAL_ARAT (AratID),
  CONSTRAINT FK_DMP_ADMIN FOREIGN KEY (LoggedBy) REFERENCES ADMIN_STAFF (AdminID),
  CONSTRAINT CK_DMP_RANGE CHECK (MinPrice <= PricePerKg AND PricePerKg <= MaxPrice)
);

CREATE TABLE PHYSICAL_BAZAR (
  BazarID    NUMBER(10)          NOT NULL,
  BazarName  VARCHAR2(100 CHAR)  NOT NULL,
  Address    VARCHAR2(200 CHAR),
  District   VARCHAR2(100 CHAR)  NOT NULL,
  ContactNo  VARCHAR2(20 CHAR),
  CONSTRAINT PK_PHYSICAL_BAZAR PRIMARY KEY (BazarID),
  CONSTRAINT UQ_BAZAR_NAME_DISTRICT UNIQUE (BazarName, District)
);

-- Weak entity #2: identified by PHYSICAL_BAZAR.
CREATE TABLE BAZAR_DAILY_RECORD (
  BazarID            NUMBER(10)    NOT NULL,
  RecordDate         DATE          NOT NULL,
  CropID             NUMBER(10)    NOT NULL,
  TransactionVolume  NUMBER(12,3)  DEFAULT 0 NOT NULL,
  Revenue            NUMBER(14,2)  DEFAULT 0 NOT NULL,
  -- CropID belongs in the key: a bazar trades several crops on the same
  -- day, and without it the second crop of the day is a PK violation.
  -- The weak-entity reading is unchanged -- the partial key is
  -- (RecordDate, CropID), still identified by the owning bazar.
  CONSTRAINT PK_BAZAR_DAILY_RECORD PRIMARY KEY (BazarID, RecordDate, CropID),
  CONSTRAINT FK_BDR_BAZAR FOREIGN KEY (BazarID)
    REFERENCES PHYSICAL_BAZAR (BazarID) ON DELETE CASCADE,
  CONSTRAINT FK_BDR_CROP FOREIGN KEY (CropID) REFERENCES CROP (CropID),
  CONSTRAINT CK_BDR_VOLUME CHECK (TransactionVolume >= 0),
  CONSTRAINT CK_BDR_REVENUE CHECK (Revenue >= 0)
);

-- =====================================================================
-- SECTION 7 — FEEDBACK (P2 — create and seed, no UI in Update-1)
-- =====================================================================

CREATE TABLE REVIEW (
  ReviewID    NUMBER(10)   NOT NULL,
  SaleOrderID NUMBER(10)   NOT NULL,
  Rating      NUMBER(1)    NOT NULL,
  ReviewComment CLOB,
  ReviewDate  DATE         DEFAULT SYSDATE NOT NULL,
  CONSTRAINT PK_REVIEW PRIMARY KEY (ReviewID),
  CONSTRAINT FK_REVIEW_ORDER FOREIGN KEY (SaleOrderID) REFERENCES SALE_ORDER (SaleOrderID) ON DELETE CASCADE,
  CONSTRAINT UQ_REVIEW_ORDER UNIQUE (SaleOrderID),
  CONSTRAINT CK_REVIEW_RATING CHECK (Rating BETWEEN 1 AND 5)
);

CREATE TABLE COMPLAINT (
  ComplaintID       NUMBER(10)        NOT NULL,
  SaleOrderID       NUMBER(10)        NOT NULL,
  ComplaintType     VARCHAR2(50 CHAR),
  Description       CLOB,
  Status            VARCHAR2(15 CHAR) DEFAULT 'OPEN' NOT NULL,
  ResolutionDate    DATE,
  HandledByAdminID  NUMBER(10),
  CONSTRAINT PK_COMPLAINT PRIMARY KEY (ComplaintID),
  CONSTRAINT FK_COMPLAINT_ORDER FOREIGN KEY (SaleOrderID) REFERENCES SALE_ORDER (SaleOrderID) ON DELETE CASCADE,
  CONSTRAINT FK_COMPLAINT_ADMIN FOREIGN KEY (HandledByAdminID) REFERENCES ADMIN_STAFF (AdminID) ON DELETE SET NULL,
  CONSTRAINT CK_COMPLAINT_STATUS CHECK (Status IN ('OPEN','IN_REVIEW','RESOLVED','REJECTED'))
);

-- =====================================================================
-- SECTION 8 — NOTIFICATIONS
--
-- Added with the feedback-batch migration. In-app only (no email/SMS,
-- per PRD §11.3). UserID is a generic FK straight to USERS rather than a
-- role-specific one -- the only table in this schema shaped that way,
-- because a notification's recipient can be any of the five roles and
-- USERS is the total/disjoint superclass every one of them resolves to.
-- Writes are best-effort from the service layer (see
-- server/src/services/notification.service.js) so a bug here can never
-- roll back one of the six PRD §9.10 transactions it is reporting on.
-- =====================================================================

CREATE TABLE NOTIFICATION (
  NotificationID     NUMBER(10)         NOT NULL,
  UserID             NUMBER(10)         NOT NULL,
  Type               VARCHAR2(30 CHAR)  NOT NULL,
  Title              VARCHAR2(150 CHAR) NOT NULL,
  Message            VARCHAR2(500 CHAR) NOT NULL,
  RelatedEntityType  VARCHAR2(30 CHAR),
  RelatedEntityID    NUMBER(10),
  IsRead             CHAR(1)            DEFAULT 'N' NOT NULL,
  CreatedAt          TIMESTAMP          DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_NOTIFICATION PRIMARY KEY (NotificationID),
  CONSTRAINT FK_NOTIFICATION_USER FOREIGN KEY (UserID) REFERENCES USERS (UserID) ON DELETE CASCADE,
  CONSTRAINT CK_NOTIFICATION_READ CHECK (IsRead IN ('Y','N'))
);

-- =====================================================================
-- End of 01_create_tables.sql - proceed to 02_business_rules.sql
-- =====================================================================
