# BigQuery DDL Dry-Run Validation Results

**Date**: Auto-generated during step 2 validation
**Target**: BigQuery scratch dataset (`cloudera-env-experiments.test`)
**Method**: Each DDL rewritten to target test dataset, then executed via `bq.createQueryJob({ dryRun: true })`

## Group 1 — 12 date_ts tables (dry_run_group1.js)

| # | Table | Result |
|---|-------|--------|
| 1 | sales_retail | ✓ dry-run OK |
| 2 | omniture_logs | ✓ dry-run OK |
| 3 | pos_transactions | ✓ dry-run OK |
| 4 | loyalty_events | ✓ dry-run OK |
| 5 | email_campaign_clicks | ✓ dry-run OK |
| 6 | return_authorizations | ✓ dry-run OK |
| 7 | delivery_routes | ✓ dry-run OK |
| 8 | driver_logs | ✓ dry-run OK |
| 9 | customer_complaints | ✓ dry-run OK |
| 10 | chat_transcripts | ✓ dry-run OK |
| 11 | shipment_tracking | ✓ dry-run OK |
| 12 | warehouse_picks | ✓ dry-run OK |

**Result: 12/12 PASSED**

## Groups 2–6 — Specialty-partitioned tables (dry_run_group2to6.js)

| # | Table | Group | Result |
|---|-------|-------|--------|
| 13 | inventory_movements | 2 | ✓ dry-run OK |
| 14 | supplier_invoices | 3 | ✓ dry-run OK |
| 15 | product_catalog_feed | 4 | ✓ dry-run OK |
| 16 | mobile_events | 5 | ✓ dry-run OK |
| 17 | returns_cdc | 6 | ✓ dry-run OK |

**Result: 5/5 PASSED**

## Group 7 — Avro tables + Views (dry_run_group7_views.js)

| # | Object | Type | Result |
|---|--------|------|--------|
| 18 | customer_signups | TABLE | ✓ dry-run OK |
| 19 | fraud_signals | TABLE | ✓ dry-run OK |

### View validation (required creating temp base tables first)

Temp base tables created in test dataset: `omniture_logs`, `fraud_signals`

| # | View | Result |
|---|------|--------|
| 1 | omniture | ✓ dry-run OK |
| 2 | v_fraud_signals_recent | ✓ dry-run OK |

Cleanup: All temp tables and views dropped from test dataset.

**Result: 4/4 PASSED**

## Overall Summary

| Category | Count | Passed | Failed |
|----------|-------|--------|--------|
| Tables (Groups 1–7) | 17 | 17 | 0 |
| Views | 2 | 2 | 0 |
| **Total** | **19** | **19** | **0** |

### AC Satisfaction
- **AC-1**: All 17 CREATE TABLE DDLs execute with zero errors on BigQuery dry-run ✅
- **AC-12**: Both CREATE VIEW DDLs parse successfully with all referenced columns resolving ✅

### View Audit Details

**omniture.sql**: All 7 column references (col_2, col_8, col_13, col_14, col_50, col_51, col_53) resolve against omniture_logs base table. `partition_ts` correctly replaces Hive `date_ts`.

**v_fraud_signals_recent.sql**: `SELECT *` resolves all columns from fraud_signals. `signal_date` (STRING) correctly used in WHERE clause with `FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))` — proper Hive-to-BigQuery function translation of `date_format(date_sub(current_date(), 1), 'yyyyMMdd')`.
