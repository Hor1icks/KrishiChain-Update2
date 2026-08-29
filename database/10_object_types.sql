-- =====================================================================
-- KrishiChain | 10_object_types.sql
--
-- Abstract data type (Oracle object type) for the user address.
-- Run as krishichain, after 09_feedback_fixes.sql. F5 (Run Script).
--
-- USERS held the address as six flat columns. They are one thing, not
-- six, so they become one column of a user-defined type. The type
-- carries a MEMBER FUNCTION, which is the part a plain composite
-- column cannot do: the object knows how to format itself, so the
-- assembly logic lives with the data instead of being repeated in
-- every view and query that needs a printable address.
--
-- Re-runnable: the migration checks whether it has already been applied.
-- =====================================================================

SET DEFINE OFF
SET SERVEROUTPUT ON


-- ---------------------------------------------------------------------
-- The type. NOT FINAL so it could be specialized later; the member
-- function is what makes this an abstract data type rather than just a
-- record, because it bundles behaviour with the data.
-- ---------------------------------------------------------------------
-- Once USERS.Address exists, the type spec has a table dependent and
-- CREATE OR REPLACE TYPE fails with ORA-02303. So the spec is created
-- only if it is not already there; the BODY below can always be
-- replaced, which is where the logic lives anyway.
DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_types WHERE type_name = 'T_ADDRESS';
  IF n = 0 THEN
    EXECUTE IMMEDIATE q'[
      CREATE TYPE t_address AS OBJECT (
        HouseNo     VARCHAR2(30  CHAR),
        Road        VARCHAR2(60  CHAR),
        Village     VARCHAR2(100 CHAR),
        Upazila     VARCHAR2(100 CHAR),
        District    VARCHAR2(100 CHAR),
        PostalCode  VARCHAR2(10  CHAR),

        MEMBER FUNCTION full_text   RETURN VARCHAR2,
        MEMBER FUNCTION short_text  RETURN VARCHAR2
      ) NOT FINAL]';
    DBMS_OUTPUT.PUT_LINE('B2: type t_address created.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('B2: type t_address already exists, skipped.');
  END IF;
END;
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


-- ---------------------------------------------------------------------
-- Add the column and copy the six flat values into it.
-- ---------------------------------------------------------------------
DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_tab_columns
   WHERE table_name = 'USERS' AND column_name = 'ADDRESS';
  IF n = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE USERS ADD (Address t_address)';
    EXECUTE IMMEDIATE '
      UPDATE USERS SET Address = t_address(HouseNo, Road, Village,
                                           Upazila, District, PostalCode)';
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('B2: Address column added and backfilled.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('B2: Address column already present, skipped.');
  END IF;
END;
/


-- ---------------------------------------------------------------------
-- V_USER_PROFILE must stop reading the flat columns BEFORE they are
-- dropped. The output column names are unchanged, so everything reading
-- through this view keeps working; FullAddress now comes from the
-- type's own member function instead of being assembled here.
--
-- Attribute access needs the table alias: u.Address.District is legal,
-- Address.District is not. Same for the member call, u.Address.full_text().
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW V_USER_PROFILE AS
SELECT u.UserID,
       u.FirstName,
       u.MiddleName,
       u.LastName,
       u.FirstName || ' ' || u.LastName                    AS FullName,
       u.Email,
       u.Gender,
       u.DateOfBirth,
       TRUNC(MONTHS_BETWEEN(SYSDATE, u.DateOfBirth) / 12)  AS Age,
       u.Address.HouseNo                                   AS HouseNo,
       u.Address.Road                                      AS Road,
       u.Address.Village                                   AS Village,
       u.Address.Upazila                                   AS Upazila,
       u.Address.District                                  AS District,
       u.Address.PostalCode                                AS PostalCode,
       u.Address.full_text()                               AS FullAddress,
       u.Address.short_text()                              AS ShortAddress,
       u.RegistrationDate,
       u.Status,
       u.Role,
       (SELECT COUNT(*) FROM USER_PHONE p WHERE p.UserID = u.UserID) AS PhoneCount
FROM   USERS u;


-- ---------------------------------------------------------------------
-- Retire the flat columns.
-- ---------------------------------------------------------------------
DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_tab_columns
   WHERE table_name = 'USERS' AND column_name = 'DISTRICT';
  IF n = 1 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE USERS DROP (HouseNo, Road, Village,
                                               Upazila, District, PostalCode)';
    DBMS_OUTPUT.PUT_LINE('B2: six flat address columns dropped.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('B2: flat columns already dropped, skipped.');
  END IF;
END;
/

-- District was NOT NULL as a column. As an object attribute that has to
-- be a table-level CHECK instead.
DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_constraints WHERE constraint_name = 'CK_USERS_DISTRICT';
  IF n = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE USERS ADD CONSTRAINT CK_USERS_DISTRICT
                       CHECK (Address IS NOT NULL AND "ADDRESS"."DISTRICT" IS NOT NULL)';
    DBMS_OUTPUT.PUT_LINE('B2: district NOT NULL re-expressed as a CHECK.');
  END IF;
END;
/


-- =====================================================================
-- VERIFICATION
-- =====================================================================

PROMPT
PROMPT ============ the type and its methods ============
SELECT type_name, attributes, methods FROM user_types WHERE type_name = 'T_ADDRESS';

PROMPT
PROMPT ============ USERS now holds ONE address column ============
SELECT column_name, data_type FROM user_tab_columns
WHERE table_name = 'USERS' AND column_id > 7 ORDER BY column_id;

PROMPT
PROMPT ============ attribute access and the member function ============
SELECT u.UserID,
       u.Address.District AS district,
       u.Address.full_text() AS full_address
FROM   USERS u WHERE u.UserID IN (1, 6, 16) ORDER BY u.UserID;
