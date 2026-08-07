-- =====================================================================
-- KrishiChain | 03_insert_data.sql
-- Phase 3, Day 3 — narratively consistent seed data.
--
-- Run as the `krishichain` user, AFTER 01_create_tables.sql and
-- 02_sequences_triggers.sql. Safe to re-run: Section 0 clears every
-- table first, and Section 12 re-syncs all 17 sequences afterwards.
--
-- WHY THE DATA LOOKS LIKE THIS (PRD 14 seed-data warning): the same five
-- farmers, five crops and seven batches thread all the way through
-- bids -> sale orders -> transport -> payments -> reviews. Random or
-- independently-generated rows make the Phase 4 advanced queries return
-- empty result sets during the demo, which the PRD calls out as the
-- single most common way this presentation goes wrong.
--
-- THE STORY
--   5 farmers in Bogura / Rangpur / Munshiganj / Pabna / Faridpur list
--   7 harvest batches through a 3-level Virtual ARAT hierarchy.
--   Batches 1-5 have finished bidding: each has an outbid chain ending
--   in a WON bid, which became a sale order, which was transported and
--   (mostly) paid. Batches 6-7 are still BIDDING_OPEN with live ACTIVE
--   bids, so the demo has something to bid on in real time.
--
-- ROW COUNTS: 5 per table is the PRD target. HARVEST_BATCH (8), BID (15),
-- STORES (7), STORAGE_UNIT (11), USERS (25 = 5 per subclass) and
-- DAILY_MARKET_PRICE (1080, generated) deliberately exceed it -- five
-- sale orders need five finished auctions upstream, and Q5's LAG trend
-- needs a real price history rather than five isolated points.
--
-- Several row counts here are driven by what the Phase 4 advanced
-- queries need in order to return explainable, non-empty results (PRD
-- §16 Definition of Done). Section 10 and batch 8 carry notes saying
-- which query depends on them -- read those before trimming anything.
--
-- DATES are all relative to SYSDATE (TRUNC(SYSDATE) - n), so the seed
-- still looks current whenever it is re-run before the viva. Only dates
-- of birth are absolute literals.
--
-- CHARACTER SET: this schema is AL32UTF8, so the VARCHAR2(n CHAR)
-- columns will hold Bengali. Seed text is English anyway -- see the
-- optional Bengali block at the end of this file for why.
--
-- DEMO LOGIN: every seeded user shares the password  Demo@1234
-- The PasswordHash column below holds a real bcrypt hash of it (cost 10),
-- so all 25 accounts can actually be signed into during the demo -- log
-- in as Abdul Karim (abdul.karim@krishichain.bd) to reach a farmer who
-- already has batches with live bids waiting to be awarded.
-- This is demo seed data for a local university project. Do not reuse
-- this pattern anywhere real: one shared, published password across
-- every account is exactly what you are taught not to do.
-- =====================================================================

SET DEFINE OFF
SET SERVEROUTPUT ON
SET FEEDBACK ON

-- =====================================================================
-- SECTION 0 — CLEAR EXISTING DATA (reverse FK order, so re-runs work)
-- =====================================================================

-- The two self-referencing FKs must be broken before their table can be
-- emptied in one statement (ParentAratID -> AratID, PreviousBidID -> BidID).
UPDATE BID          SET PreviousBidID = NULL;
UPDATE VIRTUAL_ARAT SET ParentAratID  = NULL;

DELETE FROM COMPLAINT;
DELETE FROM REVIEW;
DELETE FROM BAZAR_DAILY_RECORD;
DELETE FROM PHYSICAL_BAZAR;
DELETE FROM DAILY_MARKET_PRICE;
DELETE FROM PAYMENT;
DELETE FROM ASSIGNED_TO;
DELETE FROM TRANSPORT_REQUEST;
DELETE FROM VEHICLE;
DELETE FROM SALE_ORDER;
DELETE FROM BID;
DELETE FROM STORES;
DELETE FROM STORAGE_UNIT;
DELETE FROM WAREHOUSE;
DELETE FROM HARVEST_BATCH;
DELETE FROM VIRTUAL_ARAT;
DELETE FROM FARM;
DELETE FROM CROP;
DELETE FROM CROP_CATEGORY;
DELETE FROM TRANSPORT_PERSONNEL;
DELETE FROM STORAGE_MANAGER;
DELETE FROM ADMIN_STAFF;
DELETE FROM BUYER;
DELETE FROM FARMER;
DELETE FROM USER_PHONE;
DELETE FROM USERS;

COMMIT;

-- =====================================================================
-- SECTION 1 — USERS  (25 rows: 5 per subclass)
--
-- IDs are supplied explicitly rather than left to seq_user_id, because
-- every downstream FK in this file refers to them by number and the
-- script has to stay readable and re-runnable. The BEFORE INSERT
-- triggers only fire WHEN (NEW.<id> IS NULL), so passing an explicit ID
-- bypasses them cleanly; Section 12 then fast-forwards every sequence
-- past the highest seeded ID so the application keeps working.
--
-- ID BLOCKS:  1-5 farmers | 6-10 buyers | 11-15 admin
--            16-20 storage managers | 21-25 transport personnel
-- This is the total, disjoint specialization from PRD 7: every USERS row
-- appears in exactly one subclass table, and all 25 are covered.
-- =====================================================================

-- --- FARMERS (1-5) ---------------------------------------------------
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (1, 'Abdul', NULL, 'Karim', 'abdul.karim@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1978-04-12', '12', 'Station Road', 'Kahaloo', 'Kahaloo', 'Bogura', '5710', TRUNC(SYSDATE) - 420, 'ACTIVE', 'FARMER');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (2, 'Rahima', NULL, 'Begum', 'rahima.begum@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'F', DATE '1985-09-30', '7', 'College Road', 'Mithapukur', 'Mithapukur', 'Rangpur', '5460', TRUNC(SYSDATE) - 405, 'ACTIVE', 'FARMER');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (3, 'Jamal', 'Uddin', 'Sarkar', 'jamal.sarkar@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1972-01-18', '45', 'Ferry Ghat Road', 'Tongibari', 'Tongibari', 'Munshiganj', '1510', TRUNC(SYSDATE) - 398, 'ACTIVE', 'FARMER');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (4, 'Shafiqul', NULL, 'Islam', 'shafiqul.islam@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1981-07-25', '3', 'Hat Road', 'Sujanagar', 'Sujanagar', 'Pabna', '6600', TRUNC(SYSDATE) - 372, 'ACTIVE', 'FARMER');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (5, 'Nurjahan', NULL, 'Akter', 'nurjahan.akter@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'F', DATE '1989-11-05', '21', 'Baitul Aman Road', 'Nagarkanda', 'Nagarkanda', 'Faridpur', '7800', TRUNC(SYSDATE) - 340, 'ACTIVE', 'FARMER');

-- --- BUYERS (6-10) ---------------------------------------------------
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (6, 'Tanvir', NULL, 'Hossain', 'tanvir.hossain@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1983-02-14', '104', 'Kazi Nazrul Islam Ave', NULL, 'Tejgaon', 'Dhaka', '1215', TRUNC(SYSDATE) - 380, 'ACTIVE', 'BUYER');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (7, 'Mizanur', NULL, 'Rahman', 'mizanur.rahman@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1976-06-08', '58', 'Agrabad C/A', NULL, 'Double Mooring', 'Chattogram', '4100', TRUNC(SYSDATE) - 365, 'ACTIVE', 'BUYER');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (8, 'Sultana', NULL, 'Parvin', 'sultana.parvin@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'F', DATE '1990-12-22', '9/B', 'Mirpur Road', NULL, 'Dhanmondi', 'Dhaka', '1205', TRUNC(SYSDATE) - 310, 'ACTIVE', 'BUYER');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (9, 'Kamrul', NULL, 'Hasan', 'kamrul.hasan@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1987-03-19', '77', 'BSCIC Industrial Area', NULL, 'Fatullah', 'Narayanganj', '1420', TRUNC(SYSDATE) - 295, 'ACTIVE', 'BUYER');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (10, 'Anisur', NULL, 'Rahman', 'anisur.rahman@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1980-08-11', '16', 'Zindabazar', NULL, 'Sylhet Sadar', 'Sylhet', '3100', TRUNC(SYSDATE) - 288, 'ACTIVE', 'BUYER');

-- --- ADMIN STAFF (11-15) ---------------------------------------------
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (11, 'Farhana', NULL, 'Yasmin', 'farhana.yasmin@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'F', DATE '1991-05-02', '31', 'Bijoy Sarani', NULL, 'Tejgaon', 'Dhaka', '1215', TRUNC(SYSDATE) - 500, 'ACTIVE', 'ADMIN');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (12, 'Rezaul', NULL, 'Karim', 'rezaul.karim@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1988-10-16', '31', 'Bijoy Sarani', NULL, 'Tejgaon', 'Dhaka', '1215', TRUNC(SYSDATE) - 500, 'ACTIVE', 'ADMIN');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (13, 'Shamima', NULL, 'Nasrin', 'shamima.nasrin@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'F', DATE '1993-07-09', '31', 'Bijoy Sarani', NULL, 'Tejgaon', 'Dhaka', '1215', TRUNC(SYSDATE) - 470, 'ACTIVE', 'ADMIN');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (14, 'Habibur', NULL, 'Rahman', 'habibur.rahman@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1979-04-27', '12', 'Station Road', NULL, 'Bogura Sadar', 'Bogura', '5800', TRUNC(SYSDATE) - 455, 'ACTIVE', 'ADMIN');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (15, 'Nazmul', NULL, 'Haque', 'nazmul.haque@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1994-01-30', '31', 'Bijoy Sarani', NULL, 'Tejgaon', 'Dhaka', '1215', TRUNC(SYSDATE) - 500, 'ACTIVE', 'ADMIN');

-- --- STORAGE MANAGERS (16-20) ----------------------------------------
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (16, 'Ashraful', NULL, 'Alam', 'ashraful.alam@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1982-09-14', '6', 'Sherpur Road', NULL, 'Bogura Sadar', 'Bogura', '5800', TRUNC(SYSDATE) - 440, 'ACTIVE', 'STORAGE_MANAGER');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (17, 'Delwar', NULL, 'Hossain', 'delwar.hossain@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1986-02-03', '19', 'Jail Road', NULL, 'Rangpur Sadar', 'Rangpur', '5400', TRUNC(SYSDATE) - 435, 'ACTIVE', 'STORAGE_MANAGER');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (18, 'Salma', NULL, 'Khatun', 'salma.khatun@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'F', DATE '1990-06-21', '2', 'Munshiganj Bazar Road', NULL, 'Munshiganj Sadar', 'Munshiganj', '1500', TRUNC(SYSDATE) - 430, 'ACTIVE', 'STORAGE_MANAGER');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (19, 'Mahbub', NULL, 'Alam', 'mahbub.alam@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1984-11-11', '8', 'Rupkatha Road', NULL, 'Pabna Sadar', 'Pabna', '6600', TRUNC(SYSDATE) - 425, 'ACTIVE', 'STORAGE_MANAGER');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (20, 'Ruma', NULL, 'Akter', 'ruma.akter@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'F', DATE '1992-03-08', '14', 'Mujib Road', NULL, 'Faridpur Sadar', 'Faridpur', '7800', TRUNC(SYSDATE) - 420, 'ACTIVE', 'STORAGE_MANAGER');

-- --- TRANSPORT PERSONNEL (21-25) -------------------------------------
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (21, 'Sohel', NULL, 'Rana', 'sohel.rana@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1987-12-01', '33', 'Truck Stand Road', NULL, 'Bogura Sadar', 'Bogura', '5800', TRUNC(SYSDATE) - 410, 'ACTIVE', 'TRANSPORT_PERSONNEL');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (22, 'Babul', NULL, 'Mia', 'babul.mia@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1983-05-17', '5', 'Modern Mor', NULL, 'Rangpur Sadar', 'Rangpur', '5400', TRUNC(SYSDATE) - 400, 'ACTIVE', 'TRANSPORT_PERSONNEL');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (23, 'Rafiqul', NULL, 'Sheikh', 'rafiqul.sheikh@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1991-09-23', '61', 'Postogola', NULL, 'Shyampur', 'Dhaka', '1204', TRUNC(SYSDATE) - 390, 'ACTIVE', 'TRANSPORT_PERSONNEL');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (24, 'Jasim', 'Uddin', 'Bhuiyan', 'jasim.bhuiyan@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1979-02-28', '18', 'Chashara', NULL, 'Narayanganj Sadar', 'Narayanganj', '1400', TRUNC(SYSDATE) - 385, 'ACTIVE', 'TRANSPORT_PERSONNEL');
INSERT INTO USERS (UserID, FirstName, MiddleName, LastName, Email, PasswordHash, Gender, DateOfBirth, HouseNo, Road, Village, Upazila, District, PostalCode, RegistrationDate, Status, Role) VALUES
 (25, 'Alamgir', NULL, 'Hossain', 'alamgir.hossain@krishichain.bd', '$2b$10$z36cm2.3eH0SfqSyT/TLbuG0ZmUbPWe7YFCO4NxG6rj8VF1zRRiTy', 'M', DATE '1985-07-04', '40', 'Pabna Bus Terminal', NULL, 'Pabna Sadar', 'Pabna', '6600', TRUNC(SYSDATE) - 380, 'ACTIVE', 'TRANSPORT_PERSONNEL');

-- --- USER_PHONE: the multivalued attribute {PhoneNo}. -----------------
-- Users 1, 3, 6 and 7 carry two numbers each -- that is the whole point
-- of the separate table, so the demo needs at least a few rows proving
-- one user can hold more than one.
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (1,  '01711000001');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (1,  '01911000001');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (2,  '01711000002');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (3,  '01711000003');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (3,  '01811000003');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (4,  '01711000004');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (5,  '01711000005');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (6,  '01712000006');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (6,  '01612000006');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (7,  '01712000007');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (7,  '01912000007');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (8,  '01712000008');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (9,  '01712000009');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (10, '01712000010');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (11, '01713000011');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (12, '01713000012');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (13, '01713000013');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (14, '01713000014');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (15, '01713000015');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (16, '01714000016');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (17, '01714000017');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (18, '01714000018');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (19, '01714000019');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (20, '01714000020');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (21, '01715000021');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (22, '01715000022');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (23, '01715000023');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (24, '01715000024');
INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (25, '01715000025');

-- --- ISA SUBCLASSES: PK = the parent USERS.UserID ---------------------
INSERT INTO FARMER (FarmerID, NID, BankAccountNo, MobileBankingNo, ExperienceYears) VALUES (1, '1990123456781', '1051234567801', '01711000001', 22);
INSERT INTO FARMER (FarmerID, NID, BankAccountNo, MobileBankingNo, ExperienceYears) VALUES (2, '1990123456782', '1051234567802', '01711000002', 14);
INSERT INTO FARMER (FarmerID, NID, BankAccountNo, MobileBankingNo, ExperienceYears) VALUES (3, '1990123456783', '1051234567803', '01711000003', 28);
INSERT INTO FARMER (FarmerID, NID, BankAccountNo, MobileBankingNo, ExperienceYears) VALUES (4, '1990123456784', NULL,            '01711000004', 17);
INSERT INTO FARMER (FarmerID, NID, BankAccountNo, MobileBankingNo, ExperienceYears) VALUES (5, '1990123456785', '1051234567805', '01711000005', 9);

INSERT INTO BUYER (BuyerID, BusinessName, BuyerType, TradeLicenseNo) VALUES (6,  'Hossain Traders',        'WHOLESALER', 'TRAD-DHK-2019-0061');
INSERT INTO BUYER (BuyerID, BusinessName, BuyerType, TradeLicenseNo) VALUES (7,  'Bengal Agro Exports',    'EXPORTER',   'TRAD-CTG-2016-0072');
INSERT INTO BUYER (BuyerID, BusinessName, BuyerType, TradeLicenseNo) VALUES (8,  'Parvin Fresh Mart',      'RETAILER',   'TRAD-DHK-2021-0083');
INSERT INTO BUYER (BuyerID, BusinessName, BuyerType, TradeLicenseNo) VALUES (9,  'Hasan Food Processing',  'PROCESSOR',  'TRAD-NGJ-2018-0094');
INSERT INTO BUYER (BuyerID, BusinessName, BuyerType, TradeLicenseNo) VALUES (10, 'Anisur Bazar Supply',    'WHOLESALER', 'TRAD-SYL-2020-0105');

INSERT INTO ADMIN_STAFF (AdminID, EmployeeID, Designation) VALUES (11, 'KC-EMP-0011', 'Market Analyst');
INSERT INTO ADMIN_STAFF (AdminID, EmployeeID, Designation) VALUES (12, 'KC-EMP-0012', 'Price Officer');
INSERT INTO ADMIN_STAFF (AdminID, EmployeeID, Designation) VALUES (13, 'KC-EMP-0013', 'Compliance Officer');
INSERT INTO ADMIN_STAFF (AdminID, EmployeeID, Designation) VALUES (14, 'KC-EMP-0014', 'Regional Coordinator');
INSERT INTO ADMIN_STAFF (AdminID, EmployeeID, Designation) VALUES (15, 'KC-EMP-0015', 'System Administrator');

INSERT INTO STORAGE_MANAGER (ManagerID, EmployeeID) VALUES (16, 'KC-SM-0016');
INSERT INTO STORAGE_MANAGER (ManagerID, EmployeeID) VALUES (17, 'KC-SM-0017');
INSERT INTO STORAGE_MANAGER (ManagerID, EmployeeID) VALUES (18, 'KC-SM-0018');
INSERT INTO STORAGE_MANAGER (ManagerID, EmployeeID) VALUES (19, 'KC-SM-0019');
INSERT INTO STORAGE_MANAGER (ManagerID, EmployeeID) VALUES (20, 'KC-SM-0020');

INSERT INTO TRANSPORT_PERSONNEL (PersonnelID, LicenseNo, ExperienceYears) VALUES (21, 'DK-HV-2011-0021', 13);
INSERT INTO TRANSPORT_PERSONNEL (PersonnelID, LicenseNo, ExperienceYears) VALUES (22, 'RG-HV-2013-0022', 11);
INSERT INTO TRANSPORT_PERSONNEL (PersonnelID, LicenseNo, ExperienceYears) VALUES (23, 'DK-HV-2016-0023', 8);
INSERT INTO TRANSPORT_PERSONNEL (PersonnelID, LicenseNo, ExperienceYears) VALUES (24, 'NG-HV-2009-0024', 16);
INSERT INTO TRANSPORT_PERSONNEL (PersonnelID, LicenseNo, ExperienceYears) VALUES (25, 'PB-HV-2014-0025', 10);

COMMIT;

-- =====================================================================
-- SECTION 2 — CROPS AND FARMS
-- =====================================================================

INSERT INTO CROP_CATEGORY (CategoryID, CategoryName, Description) VALUES (1, 'Cereal',  'Staple grain crops -- rice, wheat, maize.');
INSERT INTO CROP_CATEGORY (CategoryID, CategoryName, Description) VALUES (2, 'Tuber',   'Root and tuber crops stored in cold storage.');
INSERT INTO CROP_CATEGORY (CategoryID, CategoryName, Description) VALUES (3, 'Pulse',   'Protein legumes -- lentil, chickpea, mung bean.');
INSERT INTO CROP_CATEGORY (CategoryID, CategoryName, Description) VALUES (4, 'Spice',   'Culinary spice crops -- onion, garlic, chilli.');
INSERT INTO CROP_CATEGORY (CategoryID, CategoryName, Description) VALUES (5, 'Oilseed', 'Oil-bearing seed crops -- mustard, sesame, groundnut.');

-- BasePrice is the floor for BR-09: every batch MinimumPrice below must
-- be >= its crop's BasePrice. That rule has no DB backstop yet (it is
-- cross-table -- Phase 4 service layer owns it), so the seed enforces it
-- by hand. Check the pairing before editing any price here.
INSERT INTO CROP (CropID, CropName, CategoryID, Unit, BasePrice, ShelfLifeDays, Description) VALUES (1, 'Aman Rice',    1, 'kg', 32.00, 365, 'Rain-fed monsoon paddy, harvested Nov-Dec.');
INSERT INTO CROP (CropID, CropName, CategoryID, Unit, BasePrice, ShelfLifeDays, Description) VALUES (2, 'Potato',       2, 'kg', 18.00, 120, 'Cold-storage tuber; Munshiganj is the main belt.');
INSERT INTO CROP (CropID, CropName, CategoryID, Unit, BasePrice, ShelfLifeDays, Description) VALUES (3, 'Lentil',       3, 'kg', 95.00, 300, 'Masur dal; premium pulse crop.');
INSERT INTO CROP (CropID, CropName, CategoryID, Unit, BasePrice, ShelfLifeDays, Description) VALUES (4, 'Onion',        4, 'kg', 45.00,  90, 'Highly price-volatile; Pabna and Faridpur belt.');
INSERT INTO CROP (CropID, CropName, CategoryID, Unit, BasePrice, ShelfLifeDays, Description) VALUES (5, 'Mustard Seed', 5, 'kg', 68.00, 240, 'Crushed for edible oil; winter crop.');

INSERT INTO FARM (FarmID, FarmerID, FarmName, Area, SoilType, IrrigationType, Location, District, Status) VALUES (1, 1, 'Karim Krishi Khamar',  12.50, 'Loam',       'Deep Tubewell',    'Kahaloo, Bogura',        'Bogura',     'ACTIVE');
INSERT INTO FARM (FarmID, FarmerID, FarmName, Area, SoilType, IrrigationType, Location, District, Status) VALUES (2, 2, 'Rahima Agro Field',     8.75, 'Clay Loam',  'Canal',            'Mithapukur, Rangpur',    'Rangpur',    'ACTIVE');
INSERT INTO FARM (FarmID, FarmerID, FarmName, Area, SoilType, IrrigationType, Location, District, Status) VALUES (3, 3, 'Jamal Potato Farm',    15.00, 'Silt Loam',  'Surface Pump',     'Tongibari, Munshiganj',  'Munshiganj', 'ACTIVE');
INSERT INTO FARM (FarmID, FarmerID, FarmName, Area, SoilType, IrrigationType, Location, District, Status) VALUES (4, 4, 'Shafiq Onion Field',    6.25, 'Sandy Loam', 'Shallow Tubewell', 'Sujanagar, Pabna',       'Pabna',      'ACTIVE');
INSERT INTO FARM (FarmID, FarmerID, FarmName, Area, SoilType, IrrigationType, Location, District, Status) VALUES (5, 5, 'Nurjahan Oilseed Farm',10.00, 'Alluvial',   'Rainfed',          'Nagarkanda, Faridpur',   'Faridpur',   'ACTIVE');

COMMIT;

-- =====================================================================
-- SECTION 3 — VIRTUAL ARAT (recursive relationship #1)
--
-- All five rows go in with ParentAratID NULL, then a second pass links
-- them. Doing it in one pass would fail: FK_ARAT_PARENT cannot resolve a
-- parent that has not been inserted yet (PRD 15, self-referencing FK
-- risk). The result is a genuine 3-level tree, so Phase 4's
-- CONNECT BY NOCYCLE query has real depth to walk:
--
--   1 KrishiChain Central Arat (root)
--   +-- 2 North Bengal Regional Arat
--   |    +-- 4 Bogura Zonal Arat
--   +-- 3 Central Regional Arat
--        +-- 5 Munshiganj Zonal Arat
-- =====================================================================

INSERT INTO VIRTUAL_ARAT (AratID, AratName, Region, District, Address, ContactNo, ParentAratID) VALUES (1, 'KrishiChain Central Arat',    'National',    'Dhaka',      '31 Bijoy Sarani, Tejgaon',   '029110001', NULL);
INSERT INTO VIRTUAL_ARAT (AratID, AratName, Region, District, Address, ContactNo, ParentAratID) VALUES (2, 'North Bengal Regional Arat',  'North Bengal','Rangpur',    'Jail Road, Rangpur Sadar',   '052162002', NULL);
INSERT INTO VIRTUAL_ARAT (AratID, AratName, Region, District, Address, ContactNo, ParentAratID) VALUES (3, 'Central Regional Arat',       'Central',     'Dhaka',      'Karwan Bazar, Tejgaon',      '029110003', NULL);
INSERT INTO VIRTUAL_ARAT (AratID, AratName, Region, District, Address, ContactNo, ParentAratID) VALUES (4, 'Bogura Zonal Arat',           'North Bengal','Bogura',     'Station Road, Bogura Sadar', '051266004', NULL);
INSERT INTO VIRTUAL_ARAT (AratID, AratName, Region, District, Address, ContactNo, ParentAratID) VALUES (5, 'Munshiganj Zonal Arat',       'Central',     'Munshiganj', 'Bazar Road, Munshiganj Sadar','069162005', NULL);

-- Second pass: link the hierarchy now that every AratID exists.
UPDATE VIRTUAL_ARAT SET ParentAratID = 1 WHERE AratID IN (2, 3);
UPDATE VIRTUAL_ARAT SET ParentAratID = 2 WHERE AratID = 4;
UPDATE VIRTUAL_ARAT SET ParentAratID = 3 WHERE AratID = 5;

COMMIT;

-- =====================================================================
-- SECTION 4 — HARVEST BATCH (7 rows)
--
-- AvailableQuantity is a VIRTUAL column -- never insert it, Oracle
-- computes TotalQuantity - ReservedQuantity - SoldQuantity itself.
--
-- Batches 1-5 : bidding finished, SOLD, SoldQuantity matches the sale
--               order accepted below. Bidding window is in the past.
-- Batches 6-7 : BIDDING_OPEN with a live window straddling SYSDATE, so
--               the demo can place a real bid on screen.
-- =====================================================================

INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status) VALUES
 (1, 1, 1, 4, TRUNC(SYSDATE) - 60, 5000.000, 0.000, 4000.000, 'A', 13.50, 34.00, TRUNC(SYSDATE) - 58, TRUNC(SYSDATE) - 52, 'SOLD');
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status) VALUES
 (2, 2, 3, 2, TRUNC(SYSDATE) - 55, 2000.000, 0.000, 1500.000, 'A', 10.20, 98.00, TRUNC(SYSDATE) - 53, TRUNC(SYSDATE) - 47, 'SOLD');
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status) VALUES
 (3, 3, 2, 5, TRUNC(SYSDATE) - 50, 8000.000, 0.000, 6000.000, 'B', 78.40, 19.50, TRUNC(SYSDATE) - 48, TRUNC(SYSDATE) - 42, 'SOLD');
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status) VALUES
 (4, 4, 4, 3, TRUNC(SYSDATE) - 30, 3500.000, 0.000, 3000.000, 'A', 12.80, 47.00, TRUNC(SYSDATE) - 28, TRUNC(SYSDATE) - 22, 'SOLD');
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status) VALUES
 (5, 5, 5, 3, TRUNC(SYSDATE) - 18, 2500.000, 0.000, 2000.000, 'B', 8.90, 70.00, TRUNC(SYSDATE) - 16, TRUNC(SYSDATE) - 10, 'SOLD');
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status) VALUES
 (6, 1, 2, 4, TRUNC(SYSDATE) - 10, 4000.000, 0.000, 0.000, 'A', 76.10, 20.00, TRUNC(SYSDATE) - 3, TRUNC(SYSDATE) + 4, 'BIDDING_OPEN');
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status) VALUES
 (7, 3, 4, 5, TRUNC(SYSDATE) - 7,  3000.000, 0.000, 0.000, 'B', 13.10, 48.00, TRUNC(SYSDATE) - 2, TRUNC(SYSDATE) + 5, 'BIDDING_OPEN');
-- Batch 8 is LISTED with bidding not yet open, and deliberately receives
-- NO bids. Without it the anti-join half of Q5-candidate Q4 ("batches
-- that attracted no bids at all") matches nothing and the UNION branch
-- reports a meaningless zero.
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status) VALUES
 (8, 2, 1, 2, TRUNC(SYSDATE) - 5,  1800.000, 0.000, 0.000, 'A', 12.90, 35.00, TRUNC(SYSDATE) + 1, TRUNC(SYSDATE) + 6, 'LISTED');

COMMIT;

-- =====================================================================
-- SECTION 5 — STORAGE (warehouse, weak-entity units, ternary STORES)
-- =====================================================================

-- StorageFeePerKgRate is the flat per-kg, per-season intake fee (see the
-- rationale in 06_storage_workflow.sql). Cold stores charge more than dry
-- warehouses; the potato cold store sits at the top of the 2024-25 band.
INSERT INTO WAREHOUSE (WarehouseID, WarehouseName, Address, District, Capacity, ManagerID, StorageFeePerKgRate) VALUES (1, 'Bogura Cold Storage',           'Sherpur Road, Bogura Sadar',    'Bogura',     500000.000, 16, 7.50);
INSERT INTO WAREHOUSE (WarehouseID, WarehouseName, Address, District, Capacity, ManagerID, StorageFeePerKgRate) VALUES (2, 'Rangpur Agro Warehouse',        'Jail Road, Rangpur Sadar',      'Rangpur',    300000.000, 17, 6.00);
INSERT INTO WAREHOUSE (WarehouseID, WarehouseName, Address, District, Capacity, ManagerID, StorageFeePerKgRate) VALUES (3, 'Munshiganj Potato Cold Store',  'Bazar Road, Munshiganj Sadar',  'Munshiganj', 800000.000, 18, 8.00);
INSERT INTO WAREHOUSE (WarehouseID, WarehouseName, Address, District, Capacity, ManagerID, StorageFeePerKgRate) VALUES (4, 'Pabna Central Warehouse',       'Rupkatha Road, Pabna Sadar',    'Pabna',      250000.000, 19, 5.50);
INSERT INTO WAREHOUSE (WarehouseID, WarehouseName, Address, District, Capacity, ManagerID, StorageFeePerKgRate) VALUES (5, 'Faridpur Grain Store',          'Mujib Road, Faridpur Sadar',    'Faridpur',   200000.000, 20, 5.00);

-- Weak entity #1. UnitNo is the PARTIAL key: it restarts at 1 inside
-- every warehouse, which is exactly why (WarehouseID, UnitNo) is the PK
-- and why there is no global sequence for it.
INSERT INTO STORAGE_UNIT (WarehouseID, UnitNo, Capacity, Status) VALUES (1, 1, 60000.000, 'EMPTY');
INSERT INTO STORAGE_UNIT (WarehouseID, UnitNo, Capacity, Status) VALUES (1, 2, 60000.000, 'PARTIAL');
INSERT INTO STORAGE_UNIT (WarehouseID, UnitNo, Capacity, Status) VALUES (2, 1, 40000.000, 'EMPTY');
INSERT INTO STORAGE_UNIT (WarehouseID, UnitNo, Capacity, Status) VALUES (2, 2, 40000.000, 'EMPTY');
INSERT INTO STORAGE_UNIT (WarehouseID, UnitNo, Capacity, Status) VALUES (3, 1, 90000.000, 'EMPTY');
INSERT INTO STORAGE_UNIT (WarehouseID, UnitNo, Capacity, Status) VALUES (3, 2, 90000.000, 'PARTIAL');
INSERT INTO STORAGE_UNIT (WarehouseID, UnitNo, Capacity, Status) VALUES (4, 1, 35000.000, 'PARTIAL');
INSERT INTO STORAGE_UNIT (WarehouseID, UnitNo, Capacity, Status) VALUES (4, 2, 35000.000, 'EMPTY');
INSERT INTO STORAGE_UNIT (WarehouseID, UnitNo, Capacity, Status) VALUES (5, 1, 25000.000, 'PARTIAL');
INSERT INTO STORAGE_UNIT (WarehouseID, UnitNo, Capacity, Status) VALUES (5, 2, 25000.000, 'MAINTENANCE');

-- UnitNo deliberately OMITTED here so trg_storage_unit_no assigns it.
-- Warehouse 1 already has units 1 and 2, so this row must come out as
-- unit 3 -- the live proof that the partial key is generated per
-- warehouse and not from a global counter. Nothing references it.
INSERT INTO STORAGE_UNIT (WarehouseID, Capacity, Status) VALUES (1, 45000.000, 'EMPTY');

-- Ternary #1: HARVEST_BATCH x STORAGE_UNIT x STORAGE_MANAGER. The
-- manager column is the accountability link -- who authorized the
-- allocation -- and is the reason this stays one table rather than being
-- split into binary relationships.
-- All seven are LEG 1 (pre-sale): the batch is in the farmer's own local
-- storage before it sells, so the consenting customer is the FARMER who
-- owns the batch — RequestedByFarmerID set, RequestedByBuyerID NULL
-- (CK_STORES_CUSTOMER). The farmer here is the owner of the batch's farm:
--   batch 1->farmer 1, 2->2, 3->3, 4->4, 5->5, 6->1, 7->3.
--
-- StorageFeePerKgSnapshot copies the warehouse's rate as it stood at
-- allocation time, which is the whole point of snapshotting it — a later
-- rate change must not reach back into a finished allocation.
--
-- MinimumStorageDays is chosen so the release fork is demonstrable:
-- allocations 4 and 5 are past MinimumReleaseDate (either party may
-- release directly), 6 and 7 are still inside their committed term (the
-- other party has to approve early release).
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot) VALUES (1, 1, 1, 1, 16, 5000.000, TRUNC(SYSDATE) - 59, TRUNC(SYSDATE) - 45, 'COMPLETED', 1, 10, 7.50);
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot) VALUES (2, 2, 2, 1, 17, 2000.000, TRUNC(SYSDATE) - 54, TRUNC(SYSDATE) - 40, 'COMPLETED', 2, 10, 6.00);
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot) VALUES (3, 3, 3, 1, 18, 8000.000, TRUNC(SYSDATE) - 49, TRUNC(SYSDATE) - 35, 'COMPLETED', 3, 10, 8.00);
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot) VALUES (4, 4, 4, 1, 19, 3500.000, TRUNC(SYSDATE) - 29, NULL,                  'ACTIVE',    4, 10, 5.50);
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot) VALUES (5, 5, 5, 1, 20, 2500.000, TRUNC(SYSDATE) - 17, NULL,                  'ACTIVE',    5, 15, 5.00);
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot) VALUES (6, 6, 1, 2, 16, 4000.000, TRUNC(SYSDATE) - 9,  NULL,                  'ACTIVE',    1, 30, 7.50);
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot) VALUES (7, 7, 3, 2, 18, 3000.000, TRUNC(SYSDATE) - 6,  NULL,                  'ACTIVE',    3, 20, 8.00);

COMMIT;

-- =====================================================================
-- SECTION 6 — BID (recursive relationship #2: the outbid chain)
--
-- Same NULL-first-then-UPDATE pattern as VIRTUAL_ARAT: PreviousBidID
-- points at a BidID that may not exist yet at insert time.
--
-- Every chain below satisfies BR-11 by construction (each bid is >= the
-- batch MinimumPrice AND strictly greater than the one it supersedes)
-- and BR-14 (no buyer holds two ACTIVE bids on the same batch).
--
--   Batch 1: 34.50 -> 35.25 -> 36.00 (WON)   <- 3-deep chain
--   Batch 2: 99.00 -> 102.50 (WON)
--   Batch 3: 20.00 -> 21.75 (WON)
--   Batch 4: 48.00 -> 50.25 (WON)
--   Batch 5: 71.00 -> 74.00 (WON)
--   Batch 6: 20.50 -> 22.00 (ACTIVE, live)
--   Batch 7: 49.00 -> 51.50 (ACTIVE, live)
-- =====================================================================

INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES ( 1, 1, 6,  34.50, 4000.000, TRUNC(SYSDATE) - 57 + 10/24, 'OUTBID', NULL);
INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES ( 2, 1, 7,  35.25, 4000.000, TRUNC(SYSDATE) - 56 + 14/24, 'OUTBID', NULL);
INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES ( 3, 1, 10, 36.00, 4000.000, TRUNC(SYSDATE) - 53 + 11/24, 'WON',    NULL);

INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES ( 4, 2, 9,   99.00, 1500.000, TRUNC(SYSDATE) - 52 + 9/24,  'OUTBID', NULL);
INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES ( 5, 2, 6,  102.50, 1500.000, TRUNC(SYSDATE) - 48 + 16/24, 'WON',    NULL);

INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES ( 6, 3, 8,  20.00, 6000.000, TRUNC(SYSDATE) - 47 + 12/24, 'OUTBID', NULL);
INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES ( 7, 3, 7,  21.75, 6000.000, TRUNC(SYSDATE) - 43 + 15/24, 'WON',    NULL);

INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES ( 8, 4, 9,  48.00, 3000.000, TRUNC(SYSDATE) - 27 + 10/24, 'OUTBID', NULL);
INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES ( 9, 4, 8,  50.25, 3000.000, TRUNC(SYSDATE) - 23 + 13/24, 'WON',    NULL);

INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES (10, 5, 10, 71.00, 2000.000, TRUNC(SYSDATE) - 15 + 11/24, 'OUTBID', NULL);
INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES (11, 5, 9,  74.00, 2000.000, TRUNC(SYSDATE) - 11 + 17/24, 'WON',    NULL);

INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES (12, 6, 6,  20.50, 2500.000, TRUNC(SYSDATE) - 2  + 10/24, 'OUTBID', NULL);
INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES (13, 6, 10, 22.00, 2500.000, TRUNC(SYSDATE) - 1  + 12/24, 'ACTIVE', NULL);

INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES (14, 7, 7,  49.00, 1800.000, TRUNC(SYSDATE) - 1  + 9/24,  'OUTBID', NULL);
INSERT INTO BID (BidID, BatchID, BuyerID, BidPricePerKg, RequestedQuantity, BidTime, Status, PreviousBidID) VALUES (15, 7, 8,  51.50, 2000.000, TRUNC(SYSDATE) - 1  + 18/24, 'ACTIVE', NULL);

-- Second pass: link each bid to the one it outbid.
UPDATE BID SET PreviousBidID =  1 WHERE BidID =  2;
UPDATE BID SET PreviousBidID =  2 WHERE BidID =  3;
UPDATE BID SET PreviousBidID =  4 WHERE BidID =  5;
UPDATE BID SET PreviousBidID =  6 WHERE BidID =  7;
UPDATE BID SET PreviousBidID =  8 WHERE BidID =  9;
UPDATE BID SET PreviousBidID = 10 WHERE BidID = 11;
UPDATE BID SET PreviousBidID = 12 WHERE BidID = 13;
UPDATE BID SET PreviousBidID = 14 WHERE BidID = 15;

COMMIT;

-- =====================================================================
-- SECTION 7 — SALE ORDER (the aggregation)
--
-- SALE_ORDER hangs off the WHOLE (BUYER -places- BID -on- HARVEST_BATCH)
-- relationship, not off any one of the three -- that is the aggregation
-- construct, and UQ_ORDER_BID is what makes it 1:1 with the winning bid.
-- TotalAmount is VIRTUAL: never inserted, always AcceptedQuantity x
-- AcceptedPricePerKg.
--
-- PaymentTerms exercises BOTH branches of the revised BR-20 (see
-- context.md): orders 1, 3 and 5 are ON_DELIVERY (payment blocked until
-- transport is DELIVERED), orders 2 and 4 are ADVANCE (payment allowed
-- immediately). Order 5 is ON_DELIVERY and NOT yet delivered, so it
-- deliberately has no PAYMENT row -- trg_payment_biz_rules would reject
-- one, and that rejection is worth demonstrating live.
--
--   SO 1: 4000 x  36.00 = 144,000.00
--   SO 2: 1500 x 102.50 = 153,750.00
--   SO 3: 6000 x  21.75 = 130,500.00
--   SO 4: 3000 x  50.25 = 150,750.00
--   SO 5: 2000 x  74.00 = 148,000.00
-- =====================================================================

INSERT INTO SALE_ORDER (SaleOrderID, BidID, AcceptedQuantity, AcceptedPricePerKg, OrderDate, Status, PaymentTerms) VALUES (1,  3, 4000.000,  36.00, TRUNC(SYSDATE) - 52, 'COMPLETED',  'ON_DELIVERY');
INSERT INTO SALE_ORDER (SaleOrderID, BidID, AcceptedQuantity, AcceptedPricePerKg, OrderDate, Status, PaymentTerms) VALUES (2,  5, 1500.000, 102.50, TRUNC(SYSDATE) - 47, 'COMPLETED',  'ADVANCE');
INSERT INTO SALE_ORDER (SaleOrderID, BidID, AcceptedQuantity, AcceptedPricePerKg, OrderDate, Status, PaymentTerms) VALUES (3,  7, 6000.000,  21.75, TRUNC(SYSDATE) - 42, 'COMPLETED',  'ON_DELIVERY');
INSERT INTO SALE_ORDER (SaleOrderID, BidID, AcceptedQuantity, AcceptedPricePerKg, OrderDate, Status, PaymentTerms) VALUES (4,  9, 3000.000,  50.25, TRUNC(SYSDATE) - 22, 'IN_TRANSIT', 'ADVANCE');
INSERT INTO SALE_ORDER (SaleOrderID, BidID, AcceptedQuantity, AcceptedPricePerKg, OrderDate, Status, PaymentTerms) VALUES (5, 11, 2000.000,  74.00, TRUNC(SYSDATE) - 10, 'CONFIRMED',  'ON_DELIVERY');

COMMIT;

-- =====================================================================
-- SECTION 8 — LOGISTICS (vehicles, transport requests, ternary #2)
--
-- Vehicle capacity is checked against the order quantity by hand here
-- (BR-18) for the same reason as BR-09 -- it is cross-table and the
-- Phase 4 service layer owns it, so the seed must not violate it:
--   T1 4000kg -> V1 8000  | T2 1500kg -> V2 5000 | T3 6000kg -> V1 8000
--   T4 3000kg -> V5 6000  | T5 2000kg -> V4 2500
-- =====================================================================

INSERT INTO VEHICLE (VehicleID, VehicleNo, VehicleType, Capacity, Status) VALUES (1, 'DHK-METRO-TA-11-1234', 'Truck',              8000.000, 'AVAILABLE');
INSERT INTO VEHICLE (VehicleID, VehicleNo, VehicleType, Capacity, Status) VALUES (2, 'RANGPUR-TA-12-5678',     'Truck',              5000.000, 'AVAILABLE');
INSERT INTO VEHICLE (VehicleID, VehicleNo, VehicleType, Capacity, Status) VALUES (3, 'DHK-METRO-TA-13-9012', 'Covered Van',        3000.000, 'MAINTENANCE');
INSERT INTO VEHICLE (VehicleID, VehicleNo, VehicleType, Capacity, Status) VALUES (4, 'BOGURA-TA-14-3456',      'Pickup',             2500.000, 'ASSIGNED');
INSERT INTO VEHICLE (VehicleID, VehicleNo, VehicleType, Capacity, Status) VALUES (5, 'DHK-METRO-TA-15-7890', 'Refrigerated Truck', 6000.000, 'ASSIGNED');

INSERT INTO TRANSPORT_REQUEST (TransportID, SaleOrderID, PickupLocation, DeliveryLocation, RequestDate, DeliveryDate, DeliveryStatus) VALUES
 (1, 1, 'Bogura Cold Storage, Sherpur Road, Bogura',        'Hossain Traders Depot, Tejgaon, Dhaka',        TRUNC(SYSDATE) - 51, TRUNC(SYSDATE) - 45, 'DELIVERED');
INSERT INTO TRANSPORT_REQUEST (TransportID, SaleOrderID, PickupLocation, DeliveryLocation, RequestDate, DeliveryDate, DeliveryStatus) VALUES
 (2, 2, 'Rangpur Agro Warehouse, Jail Road, Rangpur',       'Bengal Agro Exports, Agrabad, Chattogram',     TRUNC(SYSDATE) - 46, TRUNC(SYSDATE) - 40, 'DELIVERED');
INSERT INTO TRANSPORT_REQUEST (TransportID, SaleOrderID, PickupLocation, DeliveryLocation, RequestDate, DeliveryDate, DeliveryStatus) VALUES
 (3, 3, 'Munshiganj Potato Cold Store, Munshiganj',         'Parvin Fresh Mart, Dhanmondi, Dhaka',          TRUNC(SYSDATE) - 41, TRUNC(SYSDATE) - 35, 'DELIVERED');
INSERT INTO TRANSPORT_REQUEST (TransportID, SaleOrderID, PickupLocation, DeliveryLocation, RequestDate, DeliveryDate, DeliveryStatus) VALUES
 (4, 4, 'Pabna Central Warehouse, Rupkatha Road, Pabna',    'Hasan Food Processing, Fatullah, Narayanganj', TRUNC(SYSDATE) - 21, NULL,                'IN_TRANSIT');
INSERT INTO TRANSPORT_REQUEST (TransportID, SaleOrderID, PickupLocation, DeliveryLocation, RequestDate, DeliveryDate, DeliveryStatus) VALUES
 (5, 5, 'Faridpur Grain Store, Mujib Road, Faridpur',       'Anisur Bazar Supply, Zindabazar, Sylhet',      TRUNC(SYSDATE) - 9,  NULL,                'ASSIGNED');

-- Ternary #2: TRANSPORT_REQUEST x VEHICLE x TRANSPORT_PERSONNEL. Vehicle
-- 1 legitimately appears twice -- it finished trip 1 before starting
-- trip 3, which is why the triple (not the vehicle alone) is unique.
INSERT INTO ASSIGNED_TO (AssignmentID, TransportID, VehicleID, PersonnelID, AssignedDate, AssignmentStatus) VALUES (1, 1, 1, 21, TRUNC(SYSDATE) - 50, 'COMPLETED');
INSERT INTO ASSIGNED_TO (AssignmentID, TransportID, VehicleID, PersonnelID, AssignedDate, AssignmentStatus) VALUES (2, 2, 2, 22, TRUNC(SYSDATE) - 45, 'COMPLETED');
INSERT INTO ASSIGNED_TO (AssignmentID, TransportID, VehicleID, PersonnelID, AssignedDate, AssignmentStatus) VALUES (3, 3, 1, 23, TRUNC(SYSDATE) - 40, 'COMPLETED');
INSERT INTO ASSIGNED_TO (AssignmentID, TransportID, VehicleID, PersonnelID, AssignedDate, AssignmentStatus) VALUES (4, 4, 5, 24, TRUNC(SYSDATE) - 20, 'ACTIVE');
INSERT INTO ASSIGNED_TO (AssignmentID, TransportID, VehicleID, PersonnelID, AssignedDate, AssignmentStatus) VALUES (5, 5, 4, 25, TRUNC(SYSDATE) - 8,  'ACTIVE');

COMMIT;

-- =====================================================================
-- SECTION 9 — PAYMENT (direct buyer -> farmer, D-2: no ARAT commission)
--
-- Every row here has to get past trg_payment_biz_rules, so the order of
-- the inserts matters -- TRANSPORT_REQUEST above must already exist.
--
--   P1  SO1  144,000.00  ON_DELIVERY, delivered  -> allowed
--   P2  SO2  153,750.00  ADVANCE, pre-delivery   -> allowed (the whole
--                                                   point of the revised
--                                                   BR-20)
--   P3  SO3  130,500.00  ON_DELIVERY, delivered  -> allowed
--   P4  SO4   75,000.00  ADVANCE instalment 1    -> allowed
--   P5  SO4   50,000.00  ADVANCE instalment 2, PENDING
--                        running total 125,000 <= 150,750 -> allowed
--
-- SO5 has no payment on purpose: ON_DELIVERY terms, transport still
-- ASSIGNED. Trying to insert one is the live BR-20 demo.
-- =====================================================================

INSERT INTO PAYMENT (PaymentID, SaleOrderID, BuyerID, FarmerID, Amount, PaymentMethod, PaymentDate, TransactionReference, PaymentStatus) VALUES
 (1, 1, 10, 1, 144000.00, 'BANK_TRANSFER', TRUNC(SYSDATE) - 44, 'TRX-BNK-20240001', 'COMPLETED');
INSERT INTO PAYMENT (PaymentID, SaleOrderID, BuyerID, FarmerID, Amount, PaymentMethod, PaymentDate, TransactionReference, PaymentStatus) VALUES
 (2, 2, 6,  2, 153750.00, 'BANK_TRANSFER', TRUNC(SYSDATE) - 46, 'TRX-BNK-20240002', 'COMPLETED');
INSERT INTO PAYMENT (PaymentID, SaleOrderID, BuyerID, FarmerID, Amount, PaymentMethod, PaymentDate, TransactionReference, PaymentStatus) VALUES
 (3, 3, 7,  3, 130500.00, 'MOBILE_BANKING',TRUNC(SYSDATE) - 34, 'TRX-MFS-20240003', 'COMPLETED');
INSERT INTO PAYMENT (PaymentID, SaleOrderID, BuyerID, FarmerID, Amount, PaymentMethod, PaymentDate, TransactionReference, PaymentStatus) VALUES
 (4, 4, 8,  4,  75000.00, 'BANK_TRANSFER', TRUNC(SYSDATE) - 21, 'TRX-BNK-20240004', 'COMPLETED');
INSERT INTO PAYMENT (PaymentID, SaleOrderID, BuyerID, FarmerID, Amount, PaymentMethod, PaymentDate, TransactionReference, PaymentStatus) VALUES
 (5, 4, 8,  4,  50000.00, 'MOBILE_BANKING',TRUNC(SYSDATE) - 5,  'TRX-MFS-20240005', 'PENDING');

COMMIT;

-- =====================================================================
-- SECTION 10 — DAILY MARKET PRICE (generated)
--
-- Hand-writing five rows here would leave Q5's LAG/window query with
-- nothing to compare against. This block builds a real price history
-- instead (PRD 15: "give at least 2 crops a 3-month run of daily prices
-- so Q5's LAG shows a real trend"). 90 days for every series.
--
-- WHICH (crop, arat) SERIES EXIST, AND WHY IT MATTERS
-- Q1 asks "did the farmer beat the market?" by joining a sale order to
-- DAILY_MARKET_PRICE on (CropID, AratID of the batch, order date). If a
-- crop has no price series at the arat its batch was actually listed
-- through, that sale silently drops out of Q1's result. So every crop is
-- priced at arat 1 (the national reference) PLUS every arat where one of
-- its batches is listed:
--
--   crop 1 Aman Rice     -> arats 1, 4          (batches 1, 8)
--   crop 2 Potato        -> arats 1, 4, 5       (batches 3, 6)
--   crop 3 Lentil        -> arats 1, 2          (batch  2)
--   crop 4 Onion         -> arats 1, 3, 5       (batches 4, 7)
--   crop 5 Mustard Seed  -> arats 1, 3          (batch  5)
--
-- If you move a batch to a different arat, add the matching series here
-- or that sale disappears from Q1.
--
-- The price walk is deterministic -- sine waves plus a drift, no
-- DBMS_RANDOM -- so every team member's database produces identical
-- numbers and the demo screenshots stay reproducible.
--
-- EACH CROP MOVES DIFFERENTLY, ON PURPOSE. An earlier version of this
-- block used one shared curve scaled by BasePrice, which made every crop
-- in Q5 report the exact same month-over-month percentage change -- five
-- crops moving in perfect lockstep, which reads as obviously fabricated.
-- Each crop now has its own amplitude, period, phase and drift, chosen to
-- match how these crops actually behave in Bangladesh:
--
--   Aman Rice    stable staple, mild seasonal swing, slow rise
--   Potato       post-harvest glut -> drifts DOWN over the window
--   Lentil       least volatile, long slow cycle
--   Onion        notoriously volatile, big swings, sharp rise
--   Mustard Seed climbs late -- and that matters: batch 5 was sold at
--                74.00 just before the rally, so Q1 reports that sale as
--                BELOW MARKET. That is the one deliberately unflattering
--                row in the demo, and it is worth keeping. It proves Q1
--                can return a negative verdict rather than only ever
--                congratulating the platform, and it illustrates the real
--                risk the system is meant to expose: selling without
--                knowing where the price is heading.
-- =====================================================================

DECLARE
  TYPE t_num_list IS TABLE OF NUMBER;

  -- Parallel lists: series i prices crop v_crop(i) at arat v_arat(i).
  v_crop t_num_list := t_num_list(1, 1,  2, 2, 2,  3, 3,  4, 4, 4,  5, 5);
  v_arat t_num_list := t_num_list(1, 4,  1, 4, 5,  1, 2,  1, 3, 5,  1, 3);

  -- Per-crop price shape, indexed by CropID (1..5).
  v_amp    t_num_list := t_num_list(0.08,   0.12,    0.06,   0.25,   0.12);
  v_period t_num_list := t_num_list(13,     9,       17,     7,      11);
  v_phase  t_num_list := t_num_list(0.0,    1.7,     3.1,    0.8,    2.4);
  v_drift  t_num_list := t_num_list(0.0010, -0.0008, 0.0006, 0.0022, 0.0018);

  v_days  CONSTANT PLS_INTEGER := 90;
  v_cid   PLS_INTEGER;
  v_base  CROP.BasePrice%TYPE;
  v_price NUMBER;
  v_rows  PLS_INTEGER := 0;
BEGIN
  FOR i IN 1 .. v_crop.COUNT LOOP
    v_cid := v_crop(i);
    SELECT BasePrice INTO v_base FROM CROP WHERE CropID = v_cid;

    FOR d IN 0 .. v_days - 1 LOOP
      -- d = 0 is the oldest day. Crop-specific seasonal swing + a small
      -- shared ripple + crop-specific drift, then a spread so the same
      -- crop is not priced identically at every arat.
      v_price := ROUND(
                   v_base
                   * (1 + v_amp(v_cid) * SIN(d / v_period(v_cid) + v_phase(v_cid))
                        + 0.03 * SIN(d / 3.5)
                        + v_drift(v_cid) * d)
                   * (1 + 0.015 * (v_arat(i) - 1)),
                 2);

      INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice, LoggedBy)
      VALUES (v_cid,
              v_arat(i),
              TRUNC(SYSDATE) - (v_days - 1 - d),
              v_price,
              ROUND(v_price * 0.94, 2),
              ROUND(v_price * 1.07, 2),
              11 + MOD(d, 5));             -- rotates across admins 11-15

      v_rows := v_rows + 1;
    END LOOP;
  END LOOP;

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('DAILY_MARKET_PRICE: ' || v_rows || ' rows generated.');
END;
/

-- =====================================================================
-- SECTION 11 — PHYSICAL BAZAR, REVIEWS, COMPLAINTS
-- =====================================================================

INSERT INTO PHYSICAL_BAZAR (BazarID, BazarName, Address, District, ContactNo) VALUES (1, 'Karwan Bazar',       'Karwan Bazar, Tejgaon',        'Dhaka',      '029110101');
INSERT INTO PHYSICAL_BAZAR (BazarID, BazarName, Address, District, ContactNo) VALUES (2, 'Shyambazar',         'Shyambazar, Kotwali',          'Dhaka',      '029110102');
INSERT INTO PHYSICAL_BAZAR (BazarID, BazarName, Address, District, ContactNo) VALUES (3, 'Bogura Hat',         'Station Road, Bogura Sadar',   'Bogura',     '051266103');
INSERT INTO PHYSICAL_BAZAR (BazarID, BazarName, Address, District, ContactNo) VALUES (4, 'Rangpur City Bazar', 'Jail Road, Rangpur Sadar',     'Rangpur',    '052162104');
INSERT INTO PHYSICAL_BAZAR (BazarID, BazarName, Address, District, ContactNo) VALUES (5, 'Khatunganj',         'Khatunganj, Kotwali',          'Chattogram', '031262105');

-- Weak entity #2: RecordDate is the partial key, so bazar 1 carries
-- three different dates and bazar 2 carries two -- the same reason
-- STORAGE_UNIT above has several UnitNos per warehouse.
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, TransactionVolume, Revenue) VALUES (1, TRUNC(SYSDATE) - 3, 1, 18500.000, 623750.00);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, TransactionVolume, Revenue) VALUES (1, TRUNC(SYSDATE) - 2, 2, 24200.000, 449120.00);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, TransactionVolume, Revenue) VALUES (1, TRUNC(SYSDATE) - 1, 4,  9800.000, 455700.00);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, TransactionVolume, Revenue) VALUES (2, TRUNC(SYSDATE) - 2, 2, 15600.000, 288600.00);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, TransactionVolume, Revenue) VALUES (2, TRUNC(SYSDATE) - 1, 3,  4300.000, 415950.00);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, TransactionVolume, Revenue) VALUES (3, TRUNC(SYSDATE) - 1, 1, 12750.000, 428400.00);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, TransactionVolume, Revenue) VALUES (4, TRUNC(SYSDATE) - 1, 3,  6100.000, 592700.00);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, TransactionVolume, Revenue) VALUES (5, TRUNC(SYSDATE) - 1, 5,  8900.000, 620200.00);

-- P2 tables: seeded so the schema is demonstrably complete, no UI in
-- Update-1. UQ_REVIEW_ORDER means one review per sale order.
INSERT INTO REVIEW (ReviewID, SaleOrderID, Rating, ReviewComment, ReviewDate) VALUES (1, 1, 5, 'Grade A Aman rice, moisture exactly as listed. Delivered to Tejgaon two days early.',              TRUNC(SYSDATE) - 43);
INSERT INTO REVIEW (ReviewID, SaleOrderID, Rating, ReviewComment, ReviewDate) VALUES (2, 2, 4, 'Good lentil quality. Advance payment terms worked well, though loading at Rangpur was slow.',        TRUNC(SYSDATE) - 38);
INSERT INTO REVIEW (ReviewID, SaleOrderID, Rating, ReviewComment, ReviewDate) VALUES (3, 3, 3, 'Potato lot had roughly 4 percent spoilage on arrival. Cold chain held, but the grading was optimistic.', TRUNC(SYSDATE) - 33);
INSERT INTO REVIEW (ReviewID, SaleOrderID, Rating, ReviewComment, ReviewDate) VALUES (4, 4, 4, 'Onion quality is good so far. Consignment still in transit at the time of writing.',                 TRUNC(SYSDATE) - 15);
INSERT INTO REVIEW (ReviewID, SaleOrderID, Rating, ReviewComment, ReviewDate) VALUES (5, 5, 4, 'Mustard seed sample matched the listing. Awaiting dispatch from Faridpur.',                          TRUNC(SYSDATE) - 6);

INSERT INTO COMPLAINT (ComplaintID, SaleOrderID, ComplaintType, Description, Status, ResolutionDate, HandledByAdminID) VALUES
 (1, 3, 'QUALITY',        'Buyer reports ~4% spoilage in the potato consignment; requests partial credit.', 'RESOLVED',  TRUNC(SYSDATE) - 30, 13);
INSERT INTO COMPLAINT (ComplaintID, SaleOrderID, ComplaintType, Description, Status, ResolutionDate, HandledByAdminID) VALUES
 (2, 1, 'DOCUMENTATION',  'Weighbridge slip missing from the delivery paperwork at Tejgaon depot.',          'RESOLVED',  TRUNC(SYSDATE) - 42, 11);
INSERT INTO COMPLAINT (ComplaintID, SaleOrderID, ComplaintType, Description, Status, ResolutionDate, HandledByAdminID) VALUES
 (3, 4, 'DELAY',          'Consignment has been in transit past the expected delivery window.',              'IN_REVIEW', NULL,                14);
INSERT INTO COMPLAINT (ComplaintID, SaleOrderID, ComplaintType, Description, Status, ResolutionDate, HandledByAdminID) VALUES
 (4, 2, 'PAYMENT',        'Farmer queried the advance settlement date shown on the order.',                  'RESOLVED',  TRUNC(SYSDATE) - 44, 12);
INSERT INTO COMPLAINT (ComplaintID, SaleOrderID, ComplaintType, Description, Status, ResolutionDate, HandledByAdminID) VALUES
 (5, 5, 'LOGISTICS',      'Pickup from Faridpur Grain Store not yet scheduled after vehicle assignment.',    'OPEN',      NULL,                NULL);

COMMIT;

-- =====================================================================
-- SECTION 12 — RE-SYNC SEQUENCES
--
-- Every ID above was supplied literally, so all 17 sequences are still
-- sitting at 1 and the first row the application inserts would collide
-- with a seeded PK. 11g has no ALTER SEQUENCE ... RESTART, so the fix is
-- the classic three-step: bump INCREMENT BY to the gap, burn one
-- NEXTVAL, put INCREMENT BY back to 1.
--
-- Safe to re-run: if a sequence is already past the seeded maximum the
-- procedure leaves it alone. Each re-run does burn one value per
-- sequence (the probe NEXTVAL), so application-generated IDs start a
-- little above 26/6/8/... rather than exactly there. Gaps are harmless
-- -- surrogate keys only have to be unique, not consecutive.
-- =====================================================================

DECLARE
  PROCEDURE sync_seq (p_sequence IN VARCHAR2,
                      p_table    IN VARCHAR2,
                      p_column   IN VARCHAR2) IS
    v_max      NUMBER;
    v_current  NUMBER;
    v_gap      NUMBER;
    v_dummy    NUMBER;
  BEGIN
    EXECUTE IMMEDIATE 'SELECT NVL(MAX(' || p_column || '), 0) FROM ' || p_table INTO v_max;
    EXECUTE IMMEDIATE 'SELECT ' || p_sequence || '.NEXTVAL FROM dual' INTO v_current;

    v_gap := v_max - v_current;

    IF v_gap > 0 THEN
      EXECUTE IMMEDIATE 'ALTER SEQUENCE ' || p_sequence || ' INCREMENT BY ' || v_gap;
      EXECUTE IMMEDIATE 'SELECT ' || p_sequence || '.NEXTVAL FROM dual' INTO v_dummy;
      EXECUTE IMMEDIATE 'ALTER SEQUENCE ' || p_sequence || ' INCREMENT BY 1';
    END IF;

    DBMS_OUTPUT.PUT_LINE(RPAD(p_sequence, 26) || ' -> next value ' || (GREATEST(v_max, v_current) + 1));
  END sync_seq;
BEGIN
  sync_seq('seq_user_id',          'USERS',             'UserID');
  sync_seq('seq_crop_category_id', 'CROP_CATEGORY',     'CategoryID');
  sync_seq('seq_crop_id',          'CROP',              'CropID');
  sync_seq('seq_farm_id',          'FARM',              'FarmID');
  sync_seq('seq_arat_id',          'VIRTUAL_ARAT',      'AratID');
  sync_seq('seq_batch_id',         'HARVEST_BATCH',     'BatchID');
  sync_seq('seq_warehouse_id',     'WAREHOUSE',         'WarehouseID');
  sync_seq('seq_allocation_id',    'STORES',            'AllocationID');
  sync_seq('seq_bid_id',           'BID',               'BidID');
  sync_seq('seq_sale_order_id',    'SALE_ORDER',        'SaleOrderID');
  sync_seq('seq_payment_id',       'PAYMENT',           'PaymentID');
  sync_seq('seq_vehicle_id',       'VEHICLE',           'VehicleID');
  sync_seq('seq_transport_id',     'TRANSPORT_REQUEST', 'TransportID');
  sync_seq('seq_assignment_id',    'ASSIGNED_TO',       'AssignmentID');
  sync_seq('seq_bazar_id',         'PHYSICAL_BAZAR',    'BazarID');
  sync_seq('seq_review_id',        'REVIEW',            'ReviewID');
  sync_seq('seq_complaint_id',     'COMPLAINT',         'ComplaintID');
END;
/

-- =====================================================================
-- SECTION 13 — VERIFICATION
-- Row counts, then the four things most likely to be silently wrong.
-- =====================================================================

PROMPT
PROMPT ============ ROW COUNTS ============
SELECT 'USERS'               AS table_name, COUNT(*) AS rows_seeded FROM USERS
UNION ALL SELECT 'USER_PHONE',           COUNT(*) FROM USER_PHONE
UNION ALL SELECT 'FARMER',               COUNT(*) FROM FARMER
UNION ALL SELECT 'BUYER',                COUNT(*) FROM BUYER
UNION ALL SELECT 'ADMIN_STAFF',          COUNT(*) FROM ADMIN_STAFF
UNION ALL SELECT 'STORAGE_MANAGER',      COUNT(*) FROM STORAGE_MANAGER
UNION ALL SELECT 'TRANSPORT_PERSONNEL',  COUNT(*) FROM TRANSPORT_PERSONNEL
UNION ALL SELECT 'CROP_CATEGORY',        COUNT(*) FROM CROP_CATEGORY
UNION ALL SELECT 'CROP',                 COUNT(*) FROM CROP
UNION ALL SELECT 'FARM',                 COUNT(*) FROM FARM
UNION ALL SELECT 'VIRTUAL_ARAT',         COUNT(*) FROM VIRTUAL_ARAT
UNION ALL SELECT 'HARVEST_BATCH',        COUNT(*) FROM HARVEST_BATCH
UNION ALL SELECT 'WAREHOUSE',            COUNT(*) FROM WAREHOUSE
UNION ALL SELECT 'STORAGE_UNIT',         COUNT(*) FROM STORAGE_UNIT
UNION ALL SELECT 'STORES',               COUNT(*) FROM STORES
UNION ALL SELECT 'BID',                  COUNT(*) FROM BID
UNION ALL SELECT 'SALE_ORDER',           COUNT(*) FROM SALE_ORDER
UNION ALL SELECT 'PAYMENT',              COUNT(*) FROM PAYMENT
UNION ALL SELECT 'VEHICLE',              COUNT(*) FROM VEHICLE
UNION ALL SELECT 'TRANSPORT_REQUEST',    COUNT(*) FROM TRANSPORT_REQUEST
UNION ALL SELECT 'ASSIGNED_TO',          COUNT(*) FROM ASSIGNED_TO
UNION ALL SELECT 'DAILY_MARKET_PRICE',   COUNT(*) FROM DAILY_MARKET_PRICE
UNION ALL SELECT 'PHYSICAL_BAZAR',       COUNT(*) FROM PHYSICAL_BAZAR
UNION ALL SELECT 'BAZAR_DAILY_RECORD',   COUNT(*) FROM BAZAR_DAILY_RECORD
UNION ALL SELECT 'REVIEW',               COUNT(*) FROM REVIEW
UNION ALL SELECT 'COMPLAINT',            COUNT(*) FROM COMPLAINT
ORDER BY 1;

PROMPT
PROMPT ============ SPECIALIZATION IS TOTAL AND DISJOINT ============
PROMPT Expect: 25 users, 25 subclass rows, 0 uncovered, 0 in two subclasses
SELECT (SELECT COUNT(*) FROM USERS) AS users_total,
       (SELECT COUNT(*) FROM FARMER) + (SELECT COUNT(*) FROM BUYER)
       + (SELECT COUNT(*) FROM ADMIN_STAFF) + (SELECT COUNT(*) FROM STORAGE_MANAGER)
       + (SELECT COUNT(*) FROM TRANSPORT_PERSONNEL) AS subclass_total
FROM dual;

PROMPT
PROMPT ============ VIRTUAL COLUMNS COMPUTED THEMSELVES ============
SELECT BatchID, TotalQuantity, SoldQuantity, AvailableQuantity FROM HARVEST_BATCH ORDER BY BatchID;

SELECT SaleOrderID, AcceptedQuantity, AcceptedPricePerKg, TotalAmount, PaymentTerms FROM SALE_ORDER ORDER BY SaleOrderID;

PROMPT
PROMPT ============ ARAT HIERARCHY (recursive #1) ============
SELECT LEVEL AS depth, LPAD(' ', (LEVEL - 1) * 3) || AratName AS arat_tree
FROM   VIRTUAL_ARAT
START WITH ParentAratID IS NULL
CONNECT BY NOCYCLE PRIOR AratID = ParentAratID
ORDER SIBLINGS BY AratID;

PROMPT
PROMPT ============ OUTBID CHAINS (recursive #2) ============
SELECT BatchID, BidID, PreviousBidID, BidPricePerKg, Status FROM BID ORDER BY BatchID, BidID;

PROMPT
PROMPT ============ WEAK ENTITY PARTIAL KEYS ============
PROMPT Warehouse 1 should show unit 3, assigned by trg_storage_unit_no
SELECT WarehouseID, UnitNo, Status FROM STORAGE_UNIT ORDER BY WarehouseID, UnitNo;

PROMPT
PROMPT ============ PAYMENT TOTALS vs ORDER TOTALS (BR-19) ============
SELECT so.SaleOrderID, so.PaymentTerms, so.TotalAmount,
       NVL(SUM(p.Amount), 0) AS paid_so_far,
       so.TotalAmount - NVL(SUM(p.Amount), 0) AS outstanding
FROM   SALE_ORDER so
LEFT   JOIN PAYMENT p ON p.SaleOrderID = so.SaleOrderID
                     AND p.PaymentStatus IN ('PENDING','COMPLETED')
GROUP  BY so.SaleOrderID, so.PaymentTerms, so.TotalAmount
ORDER  BY so.SaleOrderID;

-- =====================================================================
-- OPTIONAL — BENGALI TEXT
--
-- NLS_CHARACTERSET on this database is AL32UTF8, so every VARCHAR2(n
-- CHAR) column will store Bengali correctly. The seed above is English
-- anyway, because the risk is on the CLIENT side, not the server: SQL*Plus
-- on Windows mangles UTF-8 script files unless NLS_LANG is set to
--   BANGLA_BANGLADESH.AL32UTF8   (or any .AL32UTF8 territory)
-- and an unset NLS_LANG turns Bengali into '?' marks on the way in --
-- silently, with no error. Running the block below with the wrong client
-- setting would corrupt good rows.
--
-- To demo Bengali support, set NLS_LANG in the client first, then run:
--
--   UPDATE CROP SET CropName = 'আমন ধান'   WHERE CropID = 1;
--   UPDATE CROP SET CropName = 'আলু'        WHERE CropID = 2;
--   UPDATE CROP SET CropName = 'মসুর ডাল'   WHERE CropID = 3;
--   UPDATE CROP SET CropName = 'পেঁয়াজ'     WHERE CropID = 4;
--   UPDATE CROP SET CropName = 'সরিষা'      WHERE CropID = 5;
--   COMMIT;
--
-- Verify with:  SELECT CropID, CropName, LENGTH(CropName) AS chars,
--                      LENGTHB(CropName) AS bytes FROM CROP;
-- chars < bytes proves the CHAR semantics are doing their job.
-- =====================================================================

-- =====================================================================
-- End of 03_insert_data.sql
-- Next: 04_views.sql (Phase 4) — V_USER_PROFILE (computes the derived
-- Age that could not be a virtual column), V_BIDDING_SUMMARY
-- (CurrentHighestBid), V_UNIT_UTILIZATION (CurrentLoad,
-- AvailableCapacity), then 05_advanced_queries.sql.
-- =====================================================================
