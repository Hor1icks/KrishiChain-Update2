'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const oracledb = require('oracledb');

const { withTransaction, query } = require('../config/db');
const { jwt: jwtConfig } = require('../config/env');
const ApiError = require('../utils/ApiError');
const { DISTRICTS } = require('../utils/districts');

const SALT_ROUNDS = 10;

/**
 * The specialization from PRD §7 is TOTAL and DISJOINT: every USERS row
 * belongs to exactly one subclass table, and the subclass PK is the same
 * value as USERS.UserID (shared-PK, no discriminator column). This map is
 * the single place that knows which table and which extra columns each
 * role needs — adding a role means adding one entry here, not editing
 * the transaction below.
 */
const SUBCLASS = {
  FARMER: {
    table: 'FARMER',
    pk: 'FarmerID',
    columns: ['NID', 'BankAccountNo', 'MobileBankingNo', 'ExperienceYears'],
    fields: ['nid', 'bankAccountNo', 'mobileBankingNo', 'experienceYears'],
    required: ['nid'],
  },
  BUYER: {
    table: 'BUYER',
    pk: 'BuyerID',
    columns: ['BusinessName', 'BuyerType', 'TradeLicenseNo'],
    fields: ['businessName', 'buyerType', 'tradeLicenseNo'],
    required: [],
  },
  ADMIN: {
    table: 'ADMIN_STAFF',
    pk: 'AdminID',
    columns: ['EmployeeID', 'Designation'],
    fields: ['employeeId', 'designation'],
    required: ['employeeId'],
  },
  STORAGE_MANAGER: {
    table: 'STORAGE_MANAGER',
    pk: 'ManagerID',
    columns: ['EmployeeID'],
    fields: ['employeeId'],
    required: ['employeeId'],
  },
  TRANSPORT_PERSONNEL: {
    table: 'TRANSPORT_PERSONNEL',
    pk: 'PersonnelID',
    columns: ['LicenseNo', 'ExperienceYears'],
    fields: ['licenseNo', 'experienceYears'],
    required: ['licenseNo'],
  },
};

const ROLES = Object.keys(SUBCLASS);

/**
 * Turn Oracle's constraint names into messages a user can act on.
 * The PK_/FK_/UQ_/CK_ naming convention from PRD §9.9 exists precisely
 * so violations stay readable — this is where that pays off.
 */
function translateOracleError(err) {
  const message = err.message || '';

  if (message.includes('UQ_USERS_EMAIL')) {
    return ApiError.conflict('That email address is already registered.');
  }
  if (message.includes('UQ_USER_PHONE_NO')) {
    return ApiError.conflict('One of those phone numbers is already registered.');
  }
  if (message.includes('UQ_FARMER_NID')) {
    return ApiError.conflict('That NID is already registered.');
  }
  if (message.includes('UQ_BUYER_LICENSE')) {
    return ApiError.conflict('That trade licence number is already registered.');
  }
  if (message.includes('UQ_PERSONNEL_LICENSE')) {
    return ApiError.conflict('That driving licence number is already registered.');
  }
  if (message.includes('UQ_ADMIN_EMPLOYEEID') || message.includes('UQ_MANAGER_EMPLOYEEID')) {
    return ApiError.conflict('That employee ID is already registered.');
  }
  if (message.includes('CK_USERS_GENDER')) {
    return ApiError.badRequest('Gender must be M, F or O.');
  }
  if (message.includes('CK_BUYER_TYPE')) {
    return ApiError.badRequest(
      'Buyer type must be WHOLESALER, RETAILER, EXPORTER or PROCESSOR.'
    );
  }
  return null;
}

function assertPresent(payload, fields) {
  const missing = fields.filter(
    (f) => payload[f] === undefined || payload[f] === null || payload[f] === ''
  );
  if (missing.length) {
    throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
  }
}

/**
 * REGISTRATION — atomic transaction #1 of the six in PRD §9.10.
 *
 * Three writes that must all succeed or all fail:
 *   1. USERS            (UserID assigned by trg_user_id from seq_user_id;
 *                        11g has no IDENTITY columns)
 *   2. <subclass>       (PK = the UserID just generated)
 *   3. USER_PHONE       (0..n rows — the multivalued attribute)
 *
 * A half-committed registration would leave a USERS row with no subclass
 * row, which silently breaks the total-specialization guarantee the whole
 * data model rests on. withTransaction() commits once at the end or rolls
 * back everything.
 */
async function register(payload) {
  const role = String(payload.role || '').toUpperCase();
  if (!ROLES.includes(role)) {
    throw ApiError.badRequest(`Role must be one of: ${ROLES.join(', ')}.`);
  }

  assertPresent(payload, [
    'firstName',
    'lastName',
    'email',
    'password',
    'gender',
    'dateOfBirth',
    'district',
    'upazila',
  ]);

  if (!DISTRICTS.includes(payload.district)) {
    throw ApiError.badRequest(`"${payload.district}" is not a district of Bangladesh.`);
  }

  const born = new Date(payload.dateOfBirth);
  if (Number.isNaN(born.getTime())) {
    throw ApiError.badRequest('Date of birth must be a real date (YYYY-MM-DD).');
  }
  const eighteenth = new Date(born.getFullYear() + 18, born.getMonth(), born.getDate());
  if (eighteenth > new Date()) {
    throw ApiError.badRequest('You must be at least 18 years old to register.');
  }

  const spec = SUBCLASS[role];
  assertPresent(payload, spec.required);

  const phones = Array.isArray(payload.phones)
    ? payload.phones.filter(Boolean)
    : [payload.phone].filter(Boolean);

  if (!phones.length) {
    throw ApiError.badRequest('At least one phone number is required.');
  }

  const passwordHash = await bcrypt.hash(payload.password, SALT_ROUNDS);

  try {
    return await withTransaction(async (connection) => {
      // --- 1. USERS -------------------------------------------------
      const userResult = await connection.execute(
        // Address is a t_address object column, so the six parts are
        // passed to the type's constructor rather than to six columns.
        `INSERT INTO USERS (
           FirstName, MiddleName, LastName, Email, PasswordHash, Gender,
           DateOfBirth, Address, Role
         ) VALUES (
           :firstName, :middleName, :lastName, :email, :passwordHash, :gender,
           TO_DATE(:dateOfBirth, 'YYYY-MM-DD'),
           t_address(:houseNo, :road, :village, :upazila, :district, :postalCode),
           :role
         )
         RETURNING UserID INTO :userId`,
        {
          firstName: payload.firstName,
          middleName: payload.middleName || null,
          lastName: payload.lastName,
          email: payload.email.toLowerCase().trim(),
          passwordHash,
          gender: payload.gender,
          dateOfBirth: payload.dateOfBirth,
          houseNo: payload.houseNo || null,
          road: payload.road || null,
          village: payload.village || null,
          upazila: payload.upazila || null,
          district: payload.district,
          postalCode: payload.postalCode || null,
          role,
          userId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        }
      );

      const userId = userResult.outBinds.userId[0];

      // --- 2. Subclass row — same ID as the USERS row above ----------
      const subclassBinds = { id: userId };
      spec.fields.forEach((field, i) => {
        subclassBinds[`v${i}`] = payload[field] ?? null;
      });

      await connection.execute(
        `INSERT INTO ${spec.table} (${spec.pk}, ${spec.columns.join(', ')})
         VALUES (:id, ${spec.fields.map((_, i) => `:v${i}`).join(', ')})`,
        subclassBinds
      );

      // --- 3. USER_PHONE — the multivalued attribute {PhoneNo} -------
      if (phones.length) {
        await connection.executeMany(
          `INSERT INTO USER_PHONE (UserID, PhoneNo) VALUES (:userId, :phoneNo)`,
          phones.map((phoneNo) => ({ userId, phoneNo: String(phoneNo).trim() }))
        );
      }

      return { userId, role };
    });
  } catch (err) {
    const translated = translateOracleError(err);
    if (translated) throw translated;
    throw err;
  }
}

function signToken(user) {
  return jwt.sign(
    { sub: user.userId, role: user.role, email: user.email },
    jwtConfig.secret,
    { expiresIn: jwtConfig.expiresIn }
  );
}

async function login(email, password) {
  if (!email || !password) {
    throw ApiError.badRequest('Email and password are required.');
  }

  const result = await query(
    `SELECT UserID, FirstName, LastName, Email, PasswordHash, Role, Status
       FROM USERS
      WHERE LOWER(Email) = :email`,
    { email: String(email).toLowerCase().trim() }
  );

  const row = result.rows[0];

  // Hash the supplied password even when the email is unknown, so a
  // missing account and a wrong password take the same time to answer.
  const hash = row ? row.PASSWORDHASH : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const ok = await bcrypt.compare(password, hash);

  if (!row || !ok) throw ApiError.unauthorized();

  if (row.STATUS !== 'ACTIVE') {
    throw ApiError.forbidden(`This account is ${row.STATUS.toLowerCase()}.`);
  }

  const user = {
    userId: row.USERID,
    firstName: row.FIRSTNAME,
    lastName: row.LASTNAME,
    email: row.EMAIL,
    role: row.ROLE,
  };

  return { user, token: signToken(user) };
}

/**
 * Age is computed here rather than stored: Oracle 11g virtual columns
 * reject non-deterministic expressions like SYSDATE, so USERS./Age/ from
 * the ER diagram cannot be a GENERATED ALWAYS column. Phase 4's
 * 04_views.sql will expose the same calculation as V_USER_PROFILE.
 */
async function getProfile(userId) {
  const result = await query(
    `SELECT u.UserID, u.FirstName, u.MiddleName, u.LastName, u.Email,
            u.Gender, u.DateOfBirth,
            u.Address.District AS District,
            u.Address.Upazila  AS Upazila,
            u.Address.Village  AS Village,
            u.Address.full_text() AS FullAddress,
            u.RegistrationDate, u.Status, u.Role,
            TRUNC(MONTHS_BETWEEN(SYSDATE, u.DateOfBirth) / 12) AS Age
       FROM USERS u
      WHERE u.UserID = :userId`,
    { userId }
  );

  const row = result.rows[0];
  if (!row) throw ApiError.unauthorized('That account no longer exists.');

  const phones = await query(
    `SELECT PhoneNo FROM USER_PHONE WHERE UserID = :userId ORDER BY PhoneNo`,
    { userId }
  );

  return {
    userId: row.USERID,
    firstName: row.FIRSTNAME,
    middleName: row.MIDDLENAME,
    lastName: row.LASTNAME,
    email: row.EMAIL,
    gender: row.GENDER,
    dateOfBirth: row.DATEOFBIRTH,
    age: row.AGE,
    district: row.DISTRICT,
    upazila: row.UPAZILA,
    village: row.VILLAGE,
    registrationDate: row.REGISTRATIONDATE,
    status: row.STATUS,
    role: row.ROLE,
    phones: phones.rows.map((p) => p.PHONENO),
  };
}

module.exports = { register, login, getProfile, ROLES };
