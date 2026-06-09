# Hive → BigQuery DDL Migration: `raw` Dataset

This project contains the BigQuery DDL definitions for the **raw landing zone** — 17 tables and 2 views migrated from Apache Hive on the `acme-lake` cluster to Google BigQuery (`acme-analytics.raw`).

## Overview

The migration converts all Hive `raw.*` tables to native BigQuery DDL with:

- **Correct type mappings**: INT→INT64, DECIMAL→NUMERIC, BOOLEAN→BOOL, DOUBLE→FLOAT64, MAP→JSON, STRUCT preserved, ARRAY preserved
- **Partition consolidation**: Multi-column Hive partitions collapsed to single synthetic columns (e.g. `year/month/day` → `movement_date DATE`)
- **SerDe handling**: RCFile, SequenceFile, RegexSerDe, and JsonSerDe source formats converted to native BigQuery tables
- **Avro schema translation**: `customer_signups` and `fraud_signals` field-mapped from `.avsc` schemas
- **View translation**: Hive functions (`date_format`, `date_sub`) converted to BigQuery equivalents (`FORMAT_DATE`, `DATE_SUB`)

## Tables (17)

| Table | Source Format | Partition Strategy | Cluster |
|-------|-------------|-------------------|---------|
| sales_retail | CSV TEXTFILE | `TIMESTAMP_TRUNC(partition_ts, HOUR)` | — |
| omniture_logs | TSV TEXTFILE | `TIMESTAMP_TRUNC(partition_ts, HOUR)` | — |
| pos_transactions | PARQUET | `TIMESTAMP_TRUNC(partition_ts, HOUR)` | — |
| loyalty_events | RegexSerDe | `TIMESTAMP_TRUNC(partition_ts, HOUR)` | — |
| email_campaign_clicks | JsonSerDe | `TIMESTAMP_TRUNC(partition_ts, HOUR)` | — |
| return_authorizations | TSV TEXTFILE | `TIMESTAMP_TRUNC(partition_ts, HOUR)` | — |
| delivery_routes | CSV TEXTFILE | `TIMESTAMP_TRUNC(partition_ts, HOUR)` | — |
| driver_logs | JsonSerDe | `TIMESTAMP_TRUNC(partition_ts, HOUR)` | — |
| customer_complaints | TSV TEXTFILE | `TIMESTAMP_TRUNC(partition_ts, HOUR)` | — |
| chat_transcripts | TSV TEXTFILE | `TIMESTAMP_TRUNC(partition_ts, HOUR)` | — |
| shipment_tracking | CSV TEXTFILE | `TIMESTAMP_TRUNC(partition_ts, HOUR)` | `carrier_partition` |
| warehouse_picks | PARQUET | `TIMESTAMP_TRUNC(partition_ts, HOUR)` | `warehouse_id_partition` |
| inventory_movements | PARQUET | `movement_date` (DATE) | — |
| supplier_invoices | SEQUENCEFILE | `DATE_TRUNC(feed_date, MONTH)` | — |
| product_catalog_feed | RCFILE | `feed_date` (DATE) | — |
| mobile_events | JsonSerDe | `TIMESTAMP_TRUNC(event_timestamp, HOUR)` | `platform` |
| returns_cdc | CSV TEXTFILE | `snapshot_date` (DATE) | — |
| customer_signups | AVRO | `signup_date` (DATE) | — |
| fraud_signals | AVRO | `TIMESTAMP_TRUNC(signal_ts, DAY)` | — |

## Views (2)

| View | Base Table | Description |
|------|-----------|-------------|
| omniture | omniture_logs | Thin projection of key web analytics columns |
| v_fraud_signals_recent | fraud_signals | Recent fraud signals (last 24h filter) |

## Project Structure

```
bigquery/raw/
├── tables/                          # 19 individual CREATE TABLE DDL files
├── views/                           # 2 CREATE VIEW DDL files
├── validation/                      # Validation scripts & report
│   ├── VALIDATION_REPORT.md         # Full validation report with pass/fail per AC
│   ├── dry_run_results.md           # Dry-run execution evidence log
│   ├── ac_assertions.mjs            # AC assertion suite — ESM (116 checks, AC-2–AC-14)
│   ├── ac_assertions.js             # AC assertion suite — CJS (119 checks, AC-1–AC-14)
│   ├── schema_parity.mjs            # Live Hive → BQ schema comparison (AC-13)
│   ├── audit_ddl.mjs                # Static DDL audit against source schema rules
│   ├── validate_schema_parity.js    # File-based schema comparison
│   ├── dry_run_group1.js            # BQ dry-run: 12 date_ts tables
│   ├── dry_run_group2to6.js         # BQ dry-run: 5 specialty tables
│   ├── dry_run_group7_views.js      # BQ dry-run: 2 Avro tables + 2 views
│   └── run_all_validation.sh        # Master validation runner
├── all_tables.sql                   # Master DDL (all tables + views in order)
```

## Validation

All 14 acceptance criteria have been validated:

| AC | Status | Description |
|----|--------|-------------|
| AC-1 | ✅ | 17 tables dry-run zero errors |
| AC-2 | ✅ | mobile_events: MAP→JSON, STRUCT/ARRAY preserved, HOUR partition, cluster platform |
| AC-3 | ✅ | inventory_movements: movement_date DATE partition, no year/month/day |
| AC-4 | ✅ | shipment_tracking: HOUR partition, CLUSTER BY carrier_partition |
| AC-5 | ✅ | warehouse_picks: HOUR partition, CLUSTER BY warehouse_id_partition |
| AC-6 | ✅ | product_catalog_feed: metadata→JSON, native BQ (no RCFile) |
| AC-7 | ✅ | supplier_invoices: line_items ARRAY\<STRUCT\>, native BQ (no SequenceFile) |
| AC-8 | ✅ | email_campaign_clicks: geo→STRUCT, utm→JSON |
| AC-9 | ✅ | driver_logs: gps→STRUCT\<lat FLOAT64, lon FLOAT64\>, extras→JSON |
| AC-10 | ✅ | customer_signups: 12 Avro fields, correct nullable types |
| AC-11 | ✅ | fraud_signals: signal_ts→TIMESTAMP, reason_codes→ARRAY\<STRING\>, score→FLOAT64 |
| AC-12 | ✅ | Both views parse successfully |
| AC-13 | ✅ | Schema parity: all columns present with correct mapped types |
| AC-14 | ✅ | 12 date_ts tables: partition_ts TIMESTAMP at HOUR granularity |

See [`bigquery/raw/validation/VALIDATION_REPORT.md`](bigquery/raw/validation/VALIDATION_REPORT.md) for the full report.

## Running Validation

```bash
# Full suite (requires BQ credentials + Hive connectivity):
set -a; source /workspace/.gallop/db.env; set +a
bash bigquery/raw/validation/run_all_validation.sh

# Local-only (no BQ/Hive connection needed):
bash bigquery/raw/validation/run_all_validation.sh --local-only

# Individual scripts:
node bigquery/raw/validation/ac_assertions.mjs            # AC-2 through AC-14 spot checks (ESM)
node bigquery/raw/validation/ac_assertions.js             # AC-1 through AC-14 spot checks (CJS)
node bigquery/raw/validation/schema_parity.mjs            # Live Hive ↔ BQ comparison (AC-13)
node bigquery/raw/validation/audit_ddl.mjs                # Static DDL audit
node bigquery/raw/validation/validate_schema_parity.js    # File-based comparison
```
