# Locked Decisions for Story f4cabdbd-6dc6-4b05-b646-f98c612ff065

## Type Mapping
## Hive → BigQuery Type Mapping Rules

### Scalar Type Mapping Table

| Hive Type | BigQuery Type | Notes |
|-----------|--------------|-------|
| `STRING` | `STRING` | Direct 1:1 |
| `INT` | `INT64` | Hive INT (32-bit) widens to BQ INT64 |
| `BIGINT` | `INT64` | Direct 1:1 |
| `TINYINT` | `INT64` | Hive TINYINT widens to BQ INT64 (no smaller integer type in BQ) |
| `BOOLEAN` | `BOOL` | Direct 1:1 |
| `DOUBLE` | `FLOAT64` | Direct 1:1 |
| `FLOAT` | `FLOAT64` | Hive FLOAT widens to BQ FLOAT64 |
| `DECIMAL(p,s)` | `NUMERIC` | BQ NUMERIC supports up to 29 integer + 9 fractional digits; all source DECIMAL(p,s) values (max p=18) fit |
| `DATE` | `DATE` | Direct 1:1 |
| `TIMESTAMP` | `TIMESTAMP` | Per decision: uniform UTC-normalized TIMESTAMP (not DATETIME) |
| `MAP<STRING,STRING>` | `JSON` | Per locked project decision (MAP/STRUCT/ARRAY strategy) |
| `STRUCT<...>` | `STRUCT<...>` | Preserved 1:1 with inner field types mapped recursively |
| `ARRAY<T>` | `ARRAY<T>` | Preserved 1:1 with element type mapped recursively |

### Avro Logical Type Mapping (customer_signups, fraud_signals)

| Avro Type | BigQuery Type | Notes |
|-----------|--------------|-------|
| `union[null, string]` | `NULLABLE STRING` | |
| `union[null, boolean]` | `NULLABLE BOOL` | |
| `union[null, int]` | `NULLABLE INT64` | |
| `union[null, double]` | `NULLABLE FLOAT64` | |
| `timestamp-millis` logical type | `TIMESTAMP` | AC-11: fraud_signals.signal_ts |
| `array<string>` | `ARRAY<STRING>` | AC-11: fraud_signals.reason_codes |

### Complex Type Detail Mapping (per AC)

| Source Table | Source Column | Hive Type | BigQuery Type |
|-------------|--------------|-----------|--------------|
| mobile_events | properties | `MAP<STRING,STRING>` | `JSON` |
| mobile_events | context | `STRUCT<ip:STRING, country:STRING, session_id:STRING, referrer:STRING>` | `STRUCT<ip STRING, country STRING, session_id STRING, referrer STRING>` |
| mobile_events | items | `ARRAY<STRUCT<sku:STRING, qty:INT, price:DECIMAL(10,2)>>` | `ARRAY<STRUCT<sku STRING, qty INT64, price NUMERIC>>` |
| product_catalog_feed | metadata | `MAP<STRING,STRING>` | `JSON` |
| supplier_invoices | line_items | `ARRAY<STRUCT<sku:STRING, qty:INT, unit_price:DECIMAL(10,2)>>` | `ARRAY<STRUCT<sku STRING, qty INT64, unit_price NUMERIC>>` |
| email_campaign_clicks | geo | `STRUCT<country:STRING, region:STRING, city:STRING>` | `STRUCT<country STRING, region STRING, city STRING>` |
| email_campaign_clicks | utm | `MAP<STRING,STRING>` | `JSON` |
| driver_logs | gps | `STRUCT<lat:DOUBLE, lon:DOUBLE>` | `STRUCT<lat FLOAT64, lon FLOAT64>` |
| driver_logs | extras | `MAP<STRING,STRING>` | `JSON` |

### Partitioning Strategy (Complete 17-Table Map)

**Group 1: 12 tables with `date_ts STRING` (yyyyMMdd_HH) → `partition_ts TIMESTAMP` at HOUR granularity**

All replace `date_ts STRING` with synthetic `partition_ts TIMESTAMP`. DDL uses `PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR)`.

| Table | Cluster By |
|-------|-----------|
| sales_retail | _(none)_ |
| omniture_logs | _(none)_ |
| pos_transactions | _(none)_ |
| loyalty_events | _(none)_ |
| email_campaign_clicks | _(none)_ |
| return_authorizations | _(none)_ |
| delivery_routes | _(none)_ |
| driver_logs | _(none)_ |
| customer_complaints | _(none)_ |
| chat_transcripts | _(none)_ |
| shipment_tracking | `carrier_partition` |
| warehouse_picks | `warehouse_id_partition` |

**Group 2: inventory_movements** — `year INT, month INT, day INT` → synthetic `movement_date DATE`, `PARTITION BY movement_date`. Original year/month/day columns dropped.

**Group 3: supplier_invoices** — `feed_year INT, feed_month INT` → synthetic `feed_date DATE` (day defaults to 1st), `PARTITION BY DATE_TRUNC(feed_date, MONTH)`. Original feed_year/feed_month columns dropped.

**Group 4: product_catalog_feed** — `feed_date STRING` → `feed_date DATE`, `PARTITION BY feed_date`.

**Group 5: mobile_events** — `event_date STRING, hour_bucket TINYINT` → synthetic `event_timestamp TIMESTAMP` parsed from event_date + hour_bucket, `PARTITION BY TIMESTAMP_TRUNC(event_timestamp, HOUR)`, `CLUSTER BY platform`. Original event_date/hour_bucket columns dropped.

**Group 6: returns_cdc** — `snapshot_date DATE` → kept as-is, `PARTITION BY snapshot_date`. Already native DATE; no transformation needed.

**Group 7: Avro-backed tables**
- `fraud_signals` — partition on `signal_ts TIMESTAMP` via `PARTITION BY TIMESTAMP_TRUNC(signal_ts, DAY)`
- `customer_signups` — partition on the natural date/timestamp field found in the Avro schema (likely `signup_date` or `created_at`); exact field TBD from `.avsc` file during implementation

### SerDe / Storage Format Handling

| Table | Hive Storage | BigQuery Target |
|-------|-------------|----------------|
| product_catalog_feed | `STORED AS RCFILE` | Native BigQuery table (no RCFile reference). Pre-load via Dataproc Spark transit to GCS Parquet. |
| supplier_invoices | `STORED AS SEQUENCEFILE` | Native BigQuery table. Pre-load via Dataproc Spark transit to GCS Parquet. |
| mobile_events | `JsonSerDe` + `STORED AS TEXTFILE` | Native BigQuery table. Load from GCS NDJSON or Parquet. |
| omniture_logs | `RegexSerDe` | Native BigQuery table. Pre-parse via Dataproc Spark to GCS Parquet. |
| customer_signups | Avro-backed (`.avsc`) | Native BigQuery table. Load via `bq load --source_format=AVRO`. |
| fraud_signals | Avro-backed (`.avsc`) | Native BigQuery table. Load via `bq load --source_format=AVRO`. |
| All other tables | `STORED AS ORC` / `STORED AS PARQUET` | Native BigQuery table. Load from GCS Parquet/ORC. |

### View Translation

| View | Translation Notes |
|------|------------------|
| `raw.omniture` | References `raw.omniture_logs` with column aliases. `date_ts` reference must change to `partition_ts`. |
| `raw.v_fraud_signals_recent` | `date_format(date_sub(current_date(), 1), 'yyyyMMdd')` → uses `signal_date` which is a STRING field; view filter logic must align with BQ's `FORMAT_DATE` syntax. |

### Key Rules
1. All columns are `NULLABLE` (BigQuery default mode) — matching Hive's universal nullability.
2. Synthetic partition columns (`partition_ts`, `movement_date`, `feed_date`, `event_timestamp`) are **added** to the schema; original partition columns (`date_ts`, `year/month/day`, `feed_year/feed_month`, `event_date/hour_bucket`) are **dropped**.
3. All DDL targets `acme-analytics.raw` dataset (per `variables.env`: `PROJECT_US=acme-analytics`, `DATASET_RAW=raw`).
4. No `STORED AS`, `SERDE`, `LOCATION`, or `TBLPROPERTIES` clauses in BigQuery DDL — all tables are native.

## Validation Strategy
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
