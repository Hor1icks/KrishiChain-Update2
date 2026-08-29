SET DEFINE OFF
SET SERVEROUTPUT ON
SET FEEDBACK ON

-- =====================================================================
-- SECTION 0 - CLEAR EXISTING DATA (reverse FK order, so re-runs work)
-- =====================================================================

UPDATE BID          SET PreviousBidID = NULL;
UPDATE VIRTUAL_ARAT SET ParentAratID  = NULL;

DELETE FROM NOTIFICATION;
DELETE FROM COMPLAINT;
DELETE FROM REVIEW;
DELETE FROM BAZAR_DAILY_RECORD;
DELETE FROM PHYSICAL_BAZAR;
DELETE FROM DAILY_MARKET_PRICE;
DELETE FROM PAYMENT;
DELETE FROM STORAGE_PAYMENT;
DELETE FROM ASSIGNED_TO;
DELETE FROM TRANSPORT_REQUEST;
DELETE FROM VEHICLE;
DELETE FROM STORES;
DELETE FROM SALE_ORDER;
DELETE FROM BID;
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
-- SECTION 1 - USERS  (25 rows: 5 per subclass)
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
-- SECTION 2 - CROPS AND FARMS
-- =====================================================================

INSERT INTO CROP_CATEGORY (CategoryID, CategoryName, Description) VALUES (1, 'Cereal',  'Staple grain crops -- rice, wheat, maize.');
INSERT INTO CROP_CATEGORY (CategoryID, CategoryName, Description) VALUES (2, 'Tuber',   'Root and tuber crops stored in cold storage.');
INSERT INTO CROP_CATEGORY (CategoryID, CategoryName, Description) VALUES (3, 'Pulse',   'Protein legumes -- lentil, chickpea, mung bean.');
INSERT INTO CROP_CATEGORY (CategoryID, CategoryName, Description) VALUES (4, 'Spice',   'Culinary spice crops -- onion, garlic, chilli.');
INSERT INTO CROP_CATEGORY (CategoryID, CategoryName, Description) VALUES (5, 'Oilseed', 'Oil-bearing seed crops -- mustard, sesame, groundnut.');

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
-- SECTION 3 - VIRTUAL ARAT (recursive relationship #1)
-- =====================================================================

INSERT INTO VIRTUAL_ARAT (AratID, AratName, Region, District, Address, ContactNo, ParentAratID) VALUES (1, 'KrishiChain Central Arat',    'National',    'Dhaka',      '31 Bijoy Sarani, Tejgaon',   '029110001', NULL);
INSERT INTO VIRTUAL_ARAT (AratID, AratName, Region, District, Address, ContactNo, ParentAratID) VALUES (2, 'North Bengal Regional Arat',  'North Bengal','Rangpur',    'Jail Road, Rangpur Sadar',   '052162002', NULL);
INSERT INTO VIRTUAL_ARAT (AratID, AratName, Region, District, Address, ContactNo, ParentAratID) VALUES (3, 'Central Regional Arat',       'Central',     'Dhaka',      'Karwan Bazar, Tejgaon',      '029110003', NULL);
INSERT INTO VIRTUAL_ARAT (AratID, AratName, Region, District, Address, ContactNo, ParentAratID) VALUES (4, 'Bogura Zonal Arat',           'North Bengal','Bogura',     'Station Road, Bogura Sadar', '051266004', NULL);
INSERT INTO VIRTUAL_ARAT (AratID, AratName, Region, District, Address, ContactNo, ParentAratID) VALUES (5, 'Munshiganj Zonal Arat',       'Central',     'Munshiganj', 'Bazar Road, Munshiganj Sadar','069162005', NULL);

-- Second pass: link the hierarchy.
UPDATE VIRTUAL_ARAT SET ParentAratID = 1 WHERE AratID IN (2, 3);
UPDATE VIRTUAL_ARAT SET ParentAratID = 2 WHERE AratID = 4;
UPDATE VIRTUAL_ARAT SET ParentAratID = 3 WHERE AratID = 5;

COMMIT;

-- =====================================================================
-- SECTION 4 - HARVEST BATCH (8 rows)
-- =====================================================================

INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status, MinimumBidQuantity) VALUES
 (1, 1, 1, 4, TRUNC(SYSDATE) - 60, 5000.000, 0.000, 4000.000, 'A', 13.50, 34.00, TRUNC(SYSDATE) - 58, TRUNC(SYSDATE) - 52, 'SOLD', 500.000);
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status, MinimumBidQuantity) VALUES
 (2, 2, 3, 2, TRUNC(SYSDATE) - 55, 2000.000, 0.000, 1500.000, 'A', 10.20, 98.00, TRUNC(SYSDATE) - 53, TRUNC(SYSDATE) - 47, 'SOLD', 200.000);
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status, MinimumBidQuantity) VALUES
 (3, 3, 2, 5, TRUNC(SYSDATE) - 50, 8000.000, 0.000, 6000.000, 'B', 78.40, 19.50, TRUNC(SYSDATE) - 48, TRUNC(SYSDATE) - 42, 'SOLD', 800.000);
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status, MinimumBidQuantity) VALUES
 (4, 4, 4, 3, TRUNC(SYSDATE) - 30, 3500.000, 0.000, 3000.000, 'A', 12.80, 47.00, TRUNC(SYSDATE) - 28, TRUNC(SYSDATE) - 22, 'SOLD', 350.000);
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status, MinimumBidQuantity) VALUES
 (5, 5, 5, 3, TRUNC(SYSDATE) - 18, 2500.000, 0.000, 2000.000, 'B', 8.90, 70.00, TRUNC(SYSDATE) - 16, TRUNC(SYSDATE) - 10, 'SOLD', 250.000);
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status, MinimumBidQuantity) VALUES
 (6, 1, 2, 4, TRUNC(SYSDATE) - 10, 4000.000, 0.000, 0.000, 'A', 76.10, 20.00, TRUNC(SYSDATE) - 3, TRUNC(SYSDATE) + 4, 'BIDDING_OPEN', 400.000);
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status, MinimumBidQuantity) VALUES
 (7, 3, 4, 5, TRUNC(SYSDATE) - 7,  3000.000, 0.000, 0.000, 'B', 13.10, 48.00, TRUNC(SYSDATE) - 2, TRUNC(SYSDATE) + 5, 'BIDDING_OPEN', 300.000);
INSERT INTO HARVEST_BATCH (BatchID, FarmID, CropID, AratID, HarvestDate, TotalQuantity, ReservedQuantity, SoldQuantity, QualityGrade, MoisturePercentage, MinimumPrice, BiddingStartTime, BiddingEndTime, Status, MinimumBidQuantity) VALUES
 (8, 2, 1, 2, TRUNC(SYSDATE) - 5,  1800.000, 0.000, 0.000, 'A', 12.90, 35.00, TRUNC(SYSDATE) + 1, TRUNC(SYSDATE) + 6, 'LISTED', 180.000);

COMMIT;

-- =====================================================================
-- SECTION 5 - STORAGE (warehouse, weak-entity units, ternary STORES)
-- =====================================================================

INSERT INTO WAREHOUSE (WarehouseID, WarehouseName, Address, District, Capacity, ManagerID, StorageFeePerKgRate) VALUES (1, 'Bogura Cold Storage',           'Sherpur Road, Bogura Sadar',    'Bogura',     500000.000, 16, 7.50);
INSERT INTO WAREHOUSE (WarehouseID, WarehouseName, Address, District, Capacity, ManagerID, StorageFeePerKgRate) VALUES (2, 'Rangpur Agro Warehouse',        'Jail Road, Rangpur Sadar',      'Rangpur',    300000.000, 17, 6.00);
INSERT INTO WAREHOUSE (WarehouseID, WarehouseName, Address, District, Capacity, ManagerID, StorageFeePerKgRate) VALUES (3, 'Munshiganj Potato Cold Store',  'Bazar Road, Munshiganj Sadar',  'Munshiganj', 800000.000, 18, 8.00);
INSERT INTO WAREHOUSE (WarehouseID, WarehouseName, Address, District, Capacity, ManagerID, StorageFeePerKgRate) VALUES (4, 'Pabna Central Warehouse',       'Rupkatha Road, Pabna Sadar',    'Pabna',      250000.000, 19, 5.50);
INSERT INTO WAREHOUSE (WarehouseID, WarehouseName, Address, District, Capacity, ManagerID, StorageFeePerKgRate) VALUES (5, 'Faridpur Grain Store',          'Mujib Road, Faridpur Sadar',    'Faridpur',   200000.000, 20, 5.00);

-- Weak entity #1: STORAGE_UNIT, partial key UnitNo.
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

INSERT INTO STORAGE_UNIT (WarehouseID, UnitNo, Capacity, Status) VALUES (1, 3, 45000.000, 'EMPTY');

-- Ternary #1: HARVEST_BATCH x STORAGE_UNIT x STORAGE_MANAGER.
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot, ProposedBy) VALUES (1, 1, 1, 1, 16, 5000.000, TRUNC(SYSDATE) - 59, TRUNC(SYSDATE) - 45, 'COMPLETED', 1, 10, 7.50, 'MANAGER');
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot, ProposedBy) VALUES (2, 2, 2, 1, 17, 2000.000, TRUNC(SYSDATE) - 54, TRUNC(SYSDATE) - 40, 'COMPLETED', 2, 10, 6.00, 'MANAGER');
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot, ProposedBy) VALUES (3, 3, 3, 1, 18, 8000.000, TRUNC(SYSDATE) - 49, TRUNC(SYSDATE) - 35, 'COMPLETED', 3, 10, 8.00, 'MANAGER');
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot, ProposedBy) VALUES (4, 4, 4, 1, 19, 3500.000, TRUNC(SYSDATE) - 29, NULL,                  'ACTIVE',    4, 10, 5.50, 'MANAGER');
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot, ProposedBy) VALUES (5, 5, 5, 1, 20, 2500.000, TRUNC(SYSDATE) - 17, NULL,                  'ACTIVE',    5, 15, 5.00, 'MANAGER');
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot, ProposedBy) VALUES (6, 6, 1, 2, 16, 4000.000, TRUNC(SYSDATE) - 9,  NULL,                  'ACTIVE',    1, 30, 7.50, 'MANAGER');
INSERT INTO STORES (AllocationID, BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored, DateIn, DateOut, AllocationStatus, RequestedByFarmerID, MinimumStorageDays, StorageFeePerKgSnapshot, ProposedBy) VALUES (7, 7, 3, 2, 18, 3000.000, TRUNC(SYSDATE) - 6,  NULL,                  'ACTIVE',    3, 20, 8.00, 'MANAGER');

-- STORAGE_PAYMENT: the aggregation, keyed on AllocationID.
INSERT INTO STORAGE_PAYMENT (StoragePaymentID, AllocationID, Amount, PaymentMethod, PaymentDate, TransactionReference, PaymentStatus) VALUES
 (1, 1, 37500.00, 'BANK_TRANSFER',  TRUNC(SYSDATE) - 45, 'TRX-STG-20240001', 'COMPLETED');
INSERT INTO STORAGE_PAYMENT (StoragePaymentID, AllocationID, Amount, PaymentMethod, PaymentDate, TransactionReference, PaymentStatus) VALUES
 (2, 2, 12000.00, 'MOBILE_BANKING', TRUNC(SYSDATE) - 40, 'TRX-STG-20240002', 'COMPLETED');
INSERT INTO STORAGE_PAYMENT (StoragePaymentID, AllocationID, Amount, PaymentMethod, PaymentDate, TransactionReference, PaymentStatus) VALUES
 (3, 3, 64000.00, 'BANK_TRANSFER',  TRUNC(SYSDATE) - 35, 'TRX-STG-20240003', 'COMPLETED');
INSERT INTO STORAGE_PAYMENT (StoragePaymentID, AllocationID, Amount, PaymentMethod, PaymentDate, TransactionReference, PaymentStatus) VALUES
 (4, 4, 19250.00, 'MOBILE_BANKING', TRUNC(SYSDATE) - 28, 'TRX-STG-20240004', 'COMPLETED');
INSERT INTO STORAGE_PAYMENT (StoragePaymentID, AllocationID, Amount, PaymentMethod, PaymentDate, TransactionReference, PaymentStatus) VALUES
 (5, 5, 12500.00, 'MOBILE_BANKING', TRUNC(SYSDATE) - 3,  'TRX-STG-20240005', 'PENDING');

COMMIT;

-- =====================================================================
-- SECTION 6 - BID (recursive relationship #2: the outbid chain)
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
-- SECTION 7 - SALE ORDER (the aggregation)
-- =====================================================================

INSERT INTO SALE_ORDER (SaleOrderID, BidID, AcceptedQuantity, AcceptedPricePerKg, OrderDate, Status, PaymentTerms, DeliveryPreference) VALUES (1,  3, 4000.000,  36.00, TRUNC(SYSDATE) - 52, 'COMPLETED',  'ON_DELIVERY', 'DIRECT');
INSERT INTO SALE_ORDER (SaleOrderID, BidID, AcceptedQuantity, AcceptedPricePerKg, OrderDate, Status, PaymentTerms, DeliveryPreference) VALUES (2,  5, 1500.000, 102.50, TRUNC(SYSDATE) - 47, 'COMPLETED',  'ADVANCE', 'DIRECT');
INSERT INTO SALE_ORDER (SaleOrderID, BidID, AcceptedQuantity, AcceptedPricePerKg, OrderDate, Status, PaymentTerms, DeliveryPreference) VALUES (3,  7, 6000.000,  21.75, TRUNC(SYSDATE) - 42, 'COMPLETED',  'ON_DELIVERY', 'DIRECT');
INSERT INTO SALE_ORDER (SaleOrderID, BidID, AcceptedQuantity, AcceptedPricePerKg, OrderDate, Status, PaymentTerms, DeliveryPreference) VALUES (4,  9, 3000.000,  50.25, TRUNC(SYSDATE) - 22, 'IN_TRANSIT', 'ADVANCE', 'DIRECT');
INSERT INTO SALE_ORDER (SaleOrderID, BidID, AcceptedQuantity, AcceptedPricePerKg, OrderDate, Status, PaymentTerms, DeliveryPreference) VALUES (5, 11, 2000.000,  74.00, TRUNC(SYSDATE) - 10, 'CONFIRMED',  'ON_DELIVERY', 'DIRECT');

COMMIT;

-- =====================================================================
-- SECTION 8 - LOGISTICS (vehicles, transport requests, ternary #2)
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

-- Ternary #2: TRANSPORT_REQUEST x VEHICLE x TRANSPORT_PERSONNEL.
INSERT INTO ASSIGNED_TO (AssignmentID, TransportID, VehicleID, PersonnelID, AssignedDate, AssignmentStatus) VALUES (1, 1, 1, 21, TRUNC(SYSDATE) - 50, 'COMPLETED');
INSERT INTO ASSIGNED_TO (AssignmentID, TransportID, VehicleID, PersonnelID, AssignedDate, AssignmentStatus) VALUES (2, 2, 2, 22, TRUNC(SYSDATE) - 45, 'COMPLETED');
INSERT INTO ASSIGNED_TO (AssignmentID, TransportID, VehicleID, PersonnelID, AssignedDate, AssignmentStatus) VALUES (3, 3, 1, 23, TRUNC(SYSDATE) - 40, 'COMPLETED');
INSERT INTO ASSIGNED_TO (AssignmentID, TransportID, VehicleID, PersonnelID, AssignedDate, AssignmentStatus) VALUES (4, 4, 5, 24, TRUNC(SYSDATE) - 20, 'ACTIVE');
INSERT INTO ASSIGNED_TO (AssignmentID, TransportID, VehicleID, PersonnelID, AssignedDate, AssignmentStatus) VALUES (5, 5, 4, 25, TRUNC(SYSDATE) - 8,  'ACTIVE');

COMMIT;

-- =====================================================================
-- SECTION 9 - PAYMENT (direct buyer -> farmer, no ARAT commission)
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
-- SECTION 10 - DAILY MARKET PRICE (30 rows)
-- =====================================================================

-- Aman Rice at the central arat.
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (1, 1, TRUNC(SYSDATE) - 124, 32.40, 30.46, 34.67);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (1, 1, TRUNC(SYSDATE) - 93, 33.10, 31.11, 35.42);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (1, 1, TRUNC(SYSDATE) - 62, 34.20, 32.15, 36.59);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (1, 1, TRUNC(SYSDATE) - 31, 35.30, 33.18, 37.77);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (1, 1, TRUNC(SYSDATE), 36.40, 34.22, 38.95);

-- Potato at the central arat.
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (2, 1, TRUNC(SYSDATE) - 124, 22.50, 21.15, 24.08);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (2, 1, TRUNC(SYSDATE) - 93, 21.40, 20.12, 22.90);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (2, 1, TRUNC(SYSDATE) - 62, 20.10, 18.89, 21.51);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (2, 1, TRUNC(SYSDATE) - 31, 19.20, 18.05, 20.54);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (2, 1, TRUNC(SYSDATE), 18.40, 17.30, 19.69);

-- Lentil at the central arat.
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (3, 1, TRUNC(SYSDATE) - 124, 93.50, 87.89, 100.05);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (3, 1, TRUNC(SYSDATE) - 93, 94.80, 89.11, 101.44);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (3, 1, TRUNC(SYSDATE) - 62, 96.20, 90.43, 102.93);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (3, 1, TRUNC(SYSDATE) - 31, 97.50, 91.65, 104.33);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (3, 1, TRUNC(SYSDATE), 99.10, 93.15, 106.04);

-- Onion at the central arat.
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (4, 1, TRUNC(SYSDATE) - 124, 41.00, 38.54, 43.87);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (4, 1, TRUNC(SYSDATE) - 93, 47.50, 44.65, 50.83);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (4, 1, TRUNC(SYSDATE) - 62, 43.20, 40.61, 46.22);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (4, 1, TRUNC(SYSDATE) - 31, 49.80, 46.81, 53.29);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (4, 1, TRUNC(SYSDATE), 52.60, 49.44, 56.28);

-- Mustard Seed at the central arat.
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (5, 1, TRUNC(SYSDATE) - 124, 66.20, 62.23, 70.83);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (5, 1, TRUNC(SYSDATE) - 93, 67.10, 63.07, 71.80);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (5, 1, TRUNC(SYSDATE) - 62, 69.40, 65.24, 74.26);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (5, 1, TRUNC(SYSDATE) - 31, 73.80, 69.37, 78.97);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (5, 1, TRUNC(SYSDATE), 78.20, 73.51, 83.67);

-- One row per sale order, at the batch arat on the order date.
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (1, 4, TRUNC(SYSDATE) - 52, 34.50, 32.43, 36.91);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (3, 2, TRUNC(SYSDATE) - 47, 99.00, 93.06, 105.93);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (2, 5, TRUNC(SYSDATE) - 42, 20.80, 19.55, 22.26);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (4, 3, TRUNC(SYSDATE) - 22, 48.60, 45.68, 52.00);
INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice) VALUES (5, 3, TRUNC(SYSDATE) - 10, 76.50, 71.91, 81.86);

COMMIT;

-- =====================================================================
-- SECTION 11 - PHYSICAL BAZAR, REVIEWS, COMPLAINTS
-- =====================================================================

INSERT INTO PHYSICAL_BAZAR (BazarID, BazarName, Address, District, ContactNo) VALUES (1, 'Karwan Bazar',       'Karwan Bazar, Tejgaon',        'Dhaka',      '029110101');
INSERT INTO PHYSICAL_BAZAR (BazarID, BazarName, Address, District, ContactNo) VALUES (2, 'Shyambazar',         'Shyambazar, Kotwali',          'Dhaka',      '029110102');
INSERT INTO PHYSICAL_BAZAR (BazarID, BazarName, Address, District, ContactNo) VALUES (3, 'Bogura Hat',         'Station Road, Bogura Sadar',   'Bogura',     '051266103');
INSERT INTO PHYSICAL_BAZAR (BazarID, BazarName, Address, District, ContactNo) VALUES (4, 'Rangpur City Bazar', 'Jail Road, Rangpur Sadar',     'Rangpur',    '052162104');
INSERT INTO PHYSICAL_BAZAR (BazarID, BazarName, Address, District, ContactNo) VALUES (5, 'Khatunganj',         'Khatunganj, Kotwali',          'Chattogram', '031262105');

-- Weak entity #2: BAZAR_DAILY_RECORD, PK (BazarID, RecordDate, CropID).
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (1, TRUNC(SYSDATE) - 52, 1, 33.72, 18500.000, 623820.00, 11);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (1, TRUNC(SYSDATE) - 52, 2, 18.56, 24200.000, 449152.00, 11);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (1, TRUNC(SYSDATE) - 52, 3, 96.10, 4300.000, 413230.00, 11);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (1, TRUNC(SYSDATE) - 20, 1, 35.10, 17200.000, 603720.00, 11);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (1, TRUNC(SYSDATE) - 20, 2, 19.20, 22400.000, 430080.00, 11);

INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (2, TRUNC(SYSDATE) - 47, 3, 98.40, 4100.000, 403440.00, 13);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (2, TRUNC(SYSDATE) - 47, 1, 33.10, 15600.000, 516360.00, 13);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (2, TRUNC(SYSDATE) - 12, 4, 46.90, 8800.000, 412720.00, 13);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (2, TRUNC(SYSDATE) - 12, 3, 97.20, 3900.000, 379080.00, 13);

INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (3, TRUNC(SYSDATE) - 42, 2, 20.10, 12750.000, 256275.00, 14);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (3, TRUNC(SYSDATE) - 42, 1, 33.90, 14100.000, 477990.00, 14);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (3, TRUNC(SYSDATE) - 5, 1, 36.10, 13400.000, 483740.00, 14);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (3, TRUNC(SYSDATE) - 5, 2, 18.90, 15900.000, 300510.00, 14);

INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (4, TRUNC(SYSDATE) - 22, 4, 47.80, 6100.000, 291580.00, 12);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (4, TRUNC(SYSDATE) - 22, 2, 19.40, 11200.000, 217280.00, 12);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (4, TRUNC(SYSDATE) - 8, 1, 35.60, 12900.000, 459240.00, 12);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (4, TRUNC(SYSDATE) - 8, 4, 49.10, 5800.000, 284780.00, 12);

INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (5, TRUNC(SYSDATE) - 10, 5, 72.50, 3200.000, 232000.00, 15);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (5, TRUNC(SYSDATE) - 10, 3, 97.80, 3600.000, 352080.00, 15);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (5, TRUNC(SYSDATE) - 3, 4, 50.90, 7400.000, 376660.00, 15);
INSERT INTO BAZAR_DAILY_RECORD (BazarID, RecordDate, CropID, PricePerKg, TransactionVolume, Revenue, LoggedBy) VALUES (5, TRUNC(SYSDATE) - 3, 5, 74.80, 2900.000, 216920.00, 15);

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

-- NOTIFICATION: one per role.
INSERT INTO NOTIFICATION (NotificationID, UserID, Type, Title, Message, RelatedEntityType, RelatedEntityID, IsRead, CreatedAt) VALUES
 (1,  1, 'BID_PLACED',         'New bid on your Aman Rice',        'A buyer has bid on batch 6. Review the standing bids before the window closes.',     'HARVEST_BATCH',     6, 'N', SYSTIMESTAMP - INTERVAL '4'  HOUR);
INSERT INTO NOTIFICATION (NotificationID, UserID, Type, Title, Message, RelatedEntityType, RelatedEntityID, IsRead, CreatedAt) VALUES
 (2, 10, 'BID_OUTBID',         'You have been outbid',             'Your bid on batch 1 was superseded by a higher one. Place a new bid to stay in.',     'HARVEST_BATCH',     1, 'Y', SYSTIMESTAMP - INTERVAL '3'  DAY);
INSERT INTO NOTIFICATION (NotificationID, UserID, Type, Title, Message, RelatedEntityType, RelatedEntityID, IsRead, CreatedAt) VALUES
 (3, 16, 'STORAGE_ACCEPTED',   'Allocation 6 accepted',            'The customer accepted your storage terms. Unit 2 at Bogura Cold Storage is now ACTIVE.', 'STORES',          6, 'N', SYSTIMESTAMP - INTERVAL '9'  DAY);
INSERT INTO NOTIFICATION (NotificationID, UserID, Type, Title, Message, RelatedEntityType, RelatedEntityID, IsRead, CreatedAt) VALUES
 (4, 14, 'COMPLAINT_RAISED',   'Complaint 3 is awaiting review',   'A delivery-delay complaint is open against sale order 4 and is assigned to you.',    'COMPLAINT',         3, 'N', SYSTIMESTAMP - INTERVAL '2'  DAY);
INSERT INTO NOTIFICATION (NotificationID, UserID, Type, Title, Message, RelatedEntityType, RelatedEntityID, IsRead, CreatedAt) VALUES
 (5, 21, 'TRANSPORT_ASSIGNED', 'You are assigned to trip 4',       'Collect from the farm gate and update the delivery status as the trip progresses.',   'TRANSPORT_REQUEST', 4, 'Y', SYSTIMESTAMP - INTERVAL '20' DAY);

COMMIT;
