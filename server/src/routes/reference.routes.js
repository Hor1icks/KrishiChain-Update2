'use strict';


const express = require('express');
const { query } = require('../config/db');
const storage = require('../services/storage.service');
const { authenticate } = require('../middleware/authenticate');
const param = require('../utils/params');
const { DISTRICTS } = require('../utils/districts');
const gateway = require('../services/sslcommerz.service');

const router = express.Router();
router.get('/districts', (_req, res) => {
  res.json(DISTRICTS);
});

router.get('/features', (_req, res) => {
  res.json({ onlinePayment: gateway.enabled() });
});

router.use(authenticate);

router.get('/crops', async (_req, res, next) => {
  try {
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

router.get('/warehouses', async (_req, res, next) => {
  try {
    res.json(await storage.listAllWarehousesPublic());
  } catch (err) {
    next(err);
  }
});

router.get('/warehouses/:warehouseId/units', async (req, res, next) => {
  try {
    res.json(await storage.listAllUnitsPublic(param.id(req.params.warehouseId, 'warehouseId')));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
