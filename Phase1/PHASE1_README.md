# KrishiChain — Phase 1 Package

Covers **Day 0 (environment proof)** and **Day 1 (ER finalization)** of the seven-day plan.

## Files

| File | Purpose |
|---|---|
| `00_environment_check.sql` | Five checks against your XE install + creates the app user |
| `test_connection.js` | Proves node-oracledb Thick mode reaches XE 11.2 |
| `ER_BLUEPRINT.md` | Every entity, attribute, relationship and cardinality — draw from this |
| `er_overview.svg` / `.png` | Structural map of all 23 entities and their relationships |
| `er_constructs.svg` / `.png` | Full Chen detail of the five graded constructs |
| `er_overview.dot` / `er_constructs.dot` | Graphviz sources, if you want to edit and re-render |

The SVGs scale cleanly — use those in the report, not the PNGs.

---

## Day 0 — run in this order

**Every team member does this on their own machine. Nobody writes code until it passes.**

**1. Confirm the XE build you installed.** Everyone should be on the same one. Windows 64-bit is the default recommendation. Check with `node -p "process.arch"` — if it says `x64`, you need 64-bit XE and 64-bit Instant Client.

**2. Run `00_environment_check.sql` as SYSTEM** in SQL Developer. Checks 1–4 run as SYSTEM; then reconnect as `krishichain` and run the Check 5 block. Record two results in the team chat:
- the `NLS_CHARACTERSET` value
- whether the virtual-column probe worked

**3. Install Oracle Instant Client 19c** (Basic or Basic Light). Unzip it somewhere stable — `C:\oracle\instantclient_19_26`. Do not put it in a OneDrive-synced folder.

**4. Run the driver proof:**
```
npm init -y
npm install oracledb
node test_connection.js
```

Edit `INSTANT_CLIENT_DIR` at the top of the file first. The script diagnoses the four errors you're most likely to hit, including `DPI-1047`, which reads like a missing file but is almost always a 32/64-bit mismatch.

**Why this matters:** node-oracledb's default Thin mode requires Oracle Database 12.1+. It cannot connect to 11.2 at all. Without `initOracleClient()` your entire backend fails at the first query, and the error message doesn't obviously point at the cause.

---

## Day 1 — redraw the ER diagram

Work from `ER_BLUEPRINT.md`. Use `er_overview` to get the structure right and `er_constructs` to get the five graded constructs drawn in correct Chen notation.

Draw it in **draw.io / diagrams.net** rather than by hand — you will revise this at least twice more before final submission, and redrawing on paper each time wastes hours.

Finish with the checklist in §3 of the blueprint. Every unticked box is lost marks.

---

## Two decisions still open

1. **Is `PHYSICAL_BAZAR` in scope?** It currently only feeds the price-comparison report. It also carries one of your two weak entities, so removing it costs you a graded construct. Recommend keeping it.
2. **BR-20 payment timing** — the design assumes payment happens *after* delivery. If you want payment on order confirmation, say so before the DDL is written; it changes the transaction boundary in PRD §9.10.

---

## Next: Phase 2

`01_create_tables.sql` and `02_sequences_triggers.sql`, written together so every table gets its matching sequence-trigger pair with consistent naming. Blocked until the ER above is approved — the DDL has to match the diagram you show the faculty.
