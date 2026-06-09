# Type Mapping

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
