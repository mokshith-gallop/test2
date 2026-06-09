# Validation Strategy

## DDL Validation Strategy

### 1. Dry-Run Validation (AC-1, AC-12)

Every generated DDL file (`CREATE TABLE` and `CREATE VIEW`) will be validated via BigQuery dry-run before acceptance:

```bash
bq query --dry_run --use_legacy_sql=false < table.sql
```

- **17 tables**: Each `CREATE OR REPLACE TABLE` must return `0 errors` on dry-run.
- **2 views**: Each `CREATE OR REPLACE VIEW` must parse successfully with all referenced column names resolving against the table DDLs applied first.
- Views depend on tables, so validation order is: all 17 tables first, then 2 views.

### 2. Schema Parity Validation Script (AC-13)

A Python validation script will be generated that:

1. **Reads source Hive schema** from the live Hive metastore via connection params in `/workspace/.gallop/db.env` (using PyHive or Hive Metastore Thrift client).
2. **Reads target BigQuery schema** via the `google-cloud-bigquery` Python client for each of the 17 tables in `acme-analytics.raw`.
3. **Compares column-by-column**:
   - Every source column is present in the target (except dropped partition columns: `date_ts`, `year/month/day`, `feed_year/feed_month`, `event_date/hour_bucket`).
   - No unexpected columns exist in the target (except synthetic partition columns: `partition_ts`, `movement_date`, `feed_date`, `event_timestamp`).
   - Each column's type maps correctly per the type mapping table (INT→INT64, DECIMAL→NUMERIC, TIMESTAMP→TIMESTAMP, MAP→JSON, STRUCT→STRUCT, ARRAY→repeated).
4. **Validates partition/cluster intent**:
   - For each table, confirms the BigQuery partition column and type matches the expected synthetic column.
   - For shipment_tracking and warehouse_picks, confirms CLUSTER BY is set on `carrier_partition` / `warehouse_id_partition`.
   - For mobile_events, confirms CLUSTER BY `platform`.

### 3. AC-Specific Spot Checks

Automated assertions for each table-specific AC:

| AC | Table | Assertion |
|----|-------|-----------|
| AC-2 | mobile_events | `properties` is JSON; `context` is STRUCT with 4 STRING fields; `items` is ARRAY of STRUCT(sku STRING, qty INT64, price NUMERIC); partition is TIMESTAMP HOUR; cluster is `platform` |
| AC-3 | inventory_movements | Partition column is `movement_date DATE`; no `year`, `month`, or `day` columns exist |
| AC-4 | shipment_tracking | Partition is `partition_ts TIMESTAMP` HOUR; CLUSTER BY `carrier_partition` |
| AC-5 | warehouse_picks | Partition is `partition_ts TIMESTAMP` HOUR; CLUSTER BY `warehouse_id_partition` |
| AC-6 | product_catalog_feed | `metadata` is JSON; no RCFile reference |
| AC-7 | supplier_invoices | `line_items` is ARRAY of STRUCT(sku STRING, qty INT64, unit_price NUMERIC); no SequenceFile reference |
| AC-8 | email_campaign_clicks | `geo` is STRUCT(country, region, city STRING); `utm` is JSON |
| AC-9 | driver_logs | `gps` is STRUCT(lat FLOAT64, lon FLOAT64); `extras` is JSON |
| AC-10 | customer_signups | 12 fields present; all NULLABLE; types match Avro union mappings |
| AC-11 | fraud_signals | `signal_ts` is TIMESTAMP; `reason_codes` is ARRAY of STRING; `score` is FLOAT64 |
| AC-14 | 12 date_ts tables | Each has `partition_ts TIMESTAMP` with HOUR granularity partitioning |

### 4. Error Handling

- **Dry-run failures**: Report the exact BigQuery error message with line number reference back to the DDL file.
- **Schema mismatches**: Generate a diff report showing expected vs actual column name/type/mode for each discrepancy.
- **View resolution failures**: Report which column references failed to resolve, tracing back to the base table DDL.

### 5. Validation Execution Order

1. Apply all 17 `CREATE TABLE` DDLs (dry-run mode)
2. Apply 2 `CREATE VIEW` DDLs (dry-run mode, requires tables to exist)
3. Run schema parity script comparing Hive metastore → BigQuery INFORMATION_SCHEMA
4. Run AC-specific assertion suite
5. Generate `VALIDATION_REPORT.md` with pass/fail per AC
