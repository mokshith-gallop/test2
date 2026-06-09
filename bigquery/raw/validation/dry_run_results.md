# BigQuery DDL Dry-Run Validation Results

**Date**: Auto-generated during step 2 execution
**Target**: BigQuery scratch dataset `cloudera-env-experiments.test`
**Method**: DDL files rewritten from `acme-analytics.raw` → test dataset, then dry-run via BigQuery API

## Group 1: 12 date_ts Tables (dry_run_group1.js)

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

**Result: 12/12 passed**

## Groups 2–6: Specialty-Partitioned Tables (dry_run_group2to6.js)

| # | Table | Group | Result |
|---|-------|-------|--------|
| 13 | inventory_movements | 2 | ✓ dry-run OK |
| 14 | supplier_invoices | 3 | ✓ dry-run OK |
| 15 | product_catalog_feed | 4 | ✓ dry-run OK |
| 16 | mobile_events | 5 | ✓ dry-run OK |
| 17 | returns_cdc | 6 | ✓ dry-run OK |

**Result: 5/5 passed**

## Group 7: Avro Tables + Views (dry_run_group7_views.js)

| # | Object | Type | Result |
|---|--------|------|--------|
| 18 | customer_signups | TABLE | ✓ dry-run OK |
| 19 | fraud_signals | TABLE | ✓ dry-run OK |
| 20 | omniture | VIEW | ✓ dry-run OK |
| 21 | v_fraud_signals_recent | VIEW | ✓ dry-run OK |

**Result: 4/4 passed**

Note: View validation required temporarily creating base tables (`omniture_logs`, `fraud_signals`)
in the test dataset so BigQuery could resolve column references. Tables were dropped after validation.

## Summary

| Category | Count | Passed | Failed |
|----------|-------|--------|--------|
| Tables (AC-1) | 17 | 17 | 0 |
| Views (AC-12) | 2 | 2 | 0 |
| **Total** | **19** | **19** | **0** |

**AC-1**: ✅ All 17 CREATE TABLE DDLs dry-run with zero errors
**AC-12**: ✅ Both CREATE VIEW DDLs dry-run successfully with all referenced columns resolving
