'use strict';

/**
 * Read-only lookup lists that the forms need: crops, ARATs, districts.
 * Shared rather than farmer-specific — the buyer and admin modules read
 * the same lists in Phases 5-6, so they live outside /api/farmer.
 *
 * Signed in but not role-restricted: this is reference data, not
 * anyone's business records.
 */

const express = require('express');
const { query } = require('../config/db');
const storage = require('../services/storage.service');
const { authenticate } = require('../middleware/authenticate');
const { DISTRICTS } = require('../utils/districts');
const gateway = require('../services/sslcommerz.service');

const router = express.Router();
// Districts are needed by the registration form, which by definition has
// no token yet, so this one sits above the authenticate middleware.
router.get('/districts', (_req, res) => {
  res.json(DISTRICTS);
});

// Lets the buyer's payment page hide the online option when no sandbox
// store is configured, rather than offering a button that always fails.
router.get('/features', (_req, res) => {
  res.json({ onlinePayment: gateway.enabled() });
});

router.use(authenticate);

router.get('/crops', async (_req, res, next) => {
  try {
    // BasePrice is included because the Create Batch form uses it to
    // warn about BR-09 before the request is even sent. The server still
    // enforces the rule — the client hint is courtesy, not control.
    const result = await query(
      `SELECT c.CropID       AS "cropId",
              c.CropName     AS "cropName",
              cc.CategoryName AS "categoryName",
              c.Unit         AS "unit",
              c.BasePrice    AS "basePrice",
              c.ShelfLifeDays AS "shelfLifeDays"
         FROM CROP c
         JOIN CROP_CATEGORY cc ON cc.CategoryID = c.CategoryID
        ORDER BY cc.CategoryName, c.CropName`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.get('/arats', async (_req, res, next) => {
  try {
    // Indented by tier so the dropdown shows the hierarchy the
    // recursive relationship encodes, rather than a flat list.
    const result = await query(
      `SELECT AratID AS "aratId",
              AratName AS "aratName",
              District AS "district",
              Tier     AS "tier",
              LPAD(' ', (Tier - 1) * 3, ' ') || AratName AS "label"
         FROM (
           SELECT AratID, AratName, District, LEVEL AS Tier, ROWNUM AS rn
             FROM VIRTUAL_ARAT
            START WITH ParentAratID IS NULL
            CONNECT BY NOCYCLE PRIOR AratID = ParentAratID
            ORDER SIBLINGS BY AratName
         )
        ORDER BY rn`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * Warehouses a customer can ask for space in. Lives here rather than in
 * storage.routes.js because that router is manager-only, and the whole
 * point of these two is that a farmer or buyer can browse somebody
 * else's warehouse before requesting an allocation against it.
 */
router.get('/warehouses', async (_req, res, next) => {
  try {
    res.json(await storage.listAllWarehousesPublic());
  } catch (err) {
    next(err);
  }
});

router.get('/warehouses/:warehouseId/units', async (req, res, next) => {
  try {
    res.json(await storage.listAllUnitsPublic(Number(req.params.warehouseId)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
