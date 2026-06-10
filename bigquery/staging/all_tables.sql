-- ============================================================================
-- Master DDL: acme-analytics.staging
-- 10 tables + 1 view for the cleansed intermediate layer
-- Generated from individual DDL files in dependency order
-- Tables first, then views
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- Group 1: 6 tables with native DATE partition columns (kept as-is)
-- ──────────────────────────────────────────────────────────────────────────

-- BigQuery DDL: staging.cleansed_orders
-- Source: Hive staging.cleansed_orders (PARTITIONED BY order_date DATE, STORED AS PARQUET)
-- Migration: order_date DATE kept as-is — already native DATE, no transformation needed
-- Type mappings: INT → INT64, DECIMAL(14,2) → NUMERIC
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.cleansed_orders` (
  order_id       STRING,
  customer_id    STRING,
  invoice_no     STRING,
  txn_ts         TIMESTAMP,
  line_count     INT64,
  gross_amount   NUMERIC,
  discount       NUMERIC,
  tax            NUMERIC,
  net_amount     NUMERIC,
  tender_type    STRING,
  source_feed    STRING,
  order_date     DATE
)
PARTITION BY order_date;

-- BigQuery DDL: staging.cleansed_customers
-- Source: Hive staging.cleansed_customers (PARTITIONED BY load_date DATE, STORED AS PARQUET)
-- Migration: load_date DATE kept as-is — already native DATE, no transformation needed
-- Type mappings: DOUBLE → FLOAT64
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.cleansed_customers` (
  customer_id     STRING,
  email_norm      STRING,
  phone_norm      STRING,
  first_name      STRING,
  last_name       STRING,
  addr_line1      STRING,
  addr_city       STRING,
  addr_region     STRING,
  addr_country    STRING,
  addr_postal     STRING,
  geocoded_lat    FLOAT64,
  geocoded_lon    FLOAT64,
  eff_from_ts     TIMESTAMP,
  record_hash     STRING,
  load_date       DATE
)
PARTITION BY load_date;

-- BigQuery DDL: staging.cleansed_products
-- Source: Hive staging.cleansed_products (PARTITIONED BY load_date DATE, STORED AS PARQUET)
-- Migration: load_date DATE kept as-is — already native DATE, no transformation needed
-- Type mappings: DECIMAL(10,2) → NUMERIC, BOOLEAN → BOOL
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.cleansed_products` (
  sku            STRING,
  upc            STRING,
  name_norm      STRING,
  category_norm  STRING,
  subcategory    STRING,
  color_norm     STRING,
  size_norm      STRING,
  msrp           NUMERIC,
  cost           NUMERIC,
  supplier_id    STRING,
  available      BOOL,
  load_date      DATE
)
PARTITION BY load_date;

-- BigQuery DDL: staging.geocoded_addresses
-- Source: Hive staging.geocoded_addresses (PARTITIONED BY load_date DATE, STORED AS PARQUET)
-- Migration: load_date DATE kept as-is — already native DATE, no transformation needed
-- Type mappings: DOUBLE → FLOAT64, DECIMAL(4,3) → NUMERIC
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.geocoded_addresses` (
  raw_addr_hash  STRING,
  addr_line1     STRING,
  addr_city      STRING,
  addr_region    STRING,
  addr_country   STRING,
  addr_postal    STRING,
  lat            FLOAT64,
  lon            FLOAT64,
  confidence     NUMERIC,
  provider       STRING,
  load_date      DATE
)
PARTITION BY load_date;

-- BigQuery DDL: staging.merged_returns_cdc
-- Source: Hive staging.merged_returns_cdc (PARTITIONED BY snapshot_date DATE, STORED AS PARQUET)
-- Migration: snapshot_date DATE kept as-is — already native DATE, no transformation needed
-- Type mappings: BIGINT → INT64, DECIMAL(12,2) → NUMERIC, BOOLEAN → BOOL
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.merged_returns_cdc` (
  return_id      INT64,
  invoice_no     STRING,
  customer_sk    INT64,
  return_ts      TIMESTAMP,
  refund_amount  NUMERIC,
  reason_code    STRING,
  status         STRING,
  is_deleted     BOOL,
  snapshot_date  DATE
)
PARTITION BY snapshot_date;

-- BigQuery DDL: staging.fraud_scored
-- Source: Hive staging.fraud_scored (PARTITIONED BY score_date DATE, STORED AS PARQUET)
-- Migration: score_date DATE kept as-is — already native DATE, no transformation needed
-- Type mappings: BIGINT → INT64, DECIMAL(5,4) → NUMERIC, ARRAY<STRING> → ARRAY<STRING>
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.fraud_scored` (
  txn_id         INT64,
  customer_id    STRING,
  fraud_score    NUMERIC,
  risk_band      STRING,
  signals        ARRAY<STRING>,
  scored_at      TIMESTAMP,
  score_date     DATE
)
PARTITION BY score_date;

-- ──────────────────────────────────────────────────────────────────────────
-- Group 2: 3 tables with date_ts STRING → synthetic DATE partition
-- ──────────────────────────────────────────────────────────────────────────

-- BigQuery DDL: staging.parsed_loyalty_events
-- Source: Hive staging.parsed_loyalty_events (PARTITIONED BY date_ts STRING, STORED AS PARQUET)
-- Migration: date_ts STRING partition dropped, replaced with synthetic event_date DATE
--            (parsed from date_ts at load time)
-- Type mappings: INT → INT64, MAP<STRING,STRING> → JSON
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.parsed_loyalty_events` (
  event_ts       TIMESTAMP,
  member_id      STRING,
  event_type     STRING,
  points         INT64,
  store_id       STRING,
  tx_id          STRING,
  meta           JSON,
  event_date     DATE
)
PARTITION BY event_date;

-- BigQuery DDL: staging.normalized_carrier_events
-- Source: Hive staging.normalized_carrier_events (PARTITIONED BY date_ts STRING, STORED AS PARQUET)
-- Migration: date_ts STRING partition dropped, replaced with synthetic event_date DATE
--            (parsed from date_ts at load time)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.normalized_carrier_events` (
  tracking_no      STRING,
  carrier          STRING,
  event_type       STRING,
  event_ts         TIMESTAMP,
  location_city    STRING,
  location_region  STRING,
  location_country STRING,
  event_date       DATE
)
PARTITION BY event_date;

-- BigQuery DDL: staging.warehouse_kpi_snapshot
-- Source: Hive staging.warehouse_kpi_snapshot (PARTITIONED BY date_ts STRING, STORED AS PARQUET)
-- Migration: date_ts STRING partition dropped, replaced with synthetic snapshot_date DATE
--            (parsed from date_ts at load time)
-- Type mappings: INT → INT64, DECIMAL(8,2) → NUMERIC
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.warehouse_kpi_snapshot` (
  warehouse_id   STRING,
  snapshot_ts    TIMESTAMP,
  units_in       INT64,
  units_picked   INT64,
  units_shipped  INT64,
  pick_rate_uph  NUMERIC,
  backlog_units  INT64,
  avg_pick_ms    INT64,
  snapshot_date  DATE
)
PARTITION BY snapshot_date;

-- ──────────────────────────────────────────────────────────────────────────
-- Group 3: 1 table with dual STRING partitions + bucketing → synthetic
--          DATE partition + CLUSTER BY (AC-2)
-- ──────────────────────────────────────────────────────────────────────────

-- BigQuery DDL: staging.dedup_clickstream
-- Source: Hive staging.dedup_clickstream (PARTITIONED BY date_ts STRING, country_partition STRING;
--         bucketed by user_id into 16 hash splits; STORED AS PARQUET)
-- Migration: date_ts STRING partition dropped, replaced with synthetic event_date DATE
--            (parsed from date_ts at load time)
--            country_partition promoted from partition column to regular data column
--            Hive hash-bucketing retired — replaced with BigQuery CLUSTER BY
-- Type mappings: DECIMAL(4,3) → NUMERIC
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.dedup_clickstream` (
  session_id          STRING,
  user_id             STRING,
  event_ts            TIMESTAMP,
  page_url            STRING,
  referrer_url        STRING,
  ip                  STRING,
  country             STRING,
  bot_score           NUMERIC,
  device_type         STRING,
  country_partition   STRING,
  event_date          DATE
)
PARTITION BY event_date
CLUSTER BY country_partition, user_id;

-- ──────────────────────────────────────────────────────────────────────────
-- Views (depend on raw layer tables)
-- ──────────────────────────────────────────────────────────────────────────

-- BigQuery DDL: staging.v_returns_pending (VIEW)
-- Source: Hive staging.v_returns_pending — pending returns awaiting approval
-- Migration: cross-dataset reference raw.return_authorizations
--          → `acme-analytics.raw.return_authorizations` (fully qualified)
--            Hive date-diff and to-date functions replaced with BigQuery equivalents:
--          → DATE_DIFF(CURRENT_DATE(), DATE(r.requested_at), DAY)
-- Original Hive query selected rma_id, customer_id, invoice_no, stock_code,
--   quantity, requested_at, and computed days_pending from raw.return_authorizations
--   filtering on unapproved returns

CREATE OR REPLACE VIEW `acme-analytics.staging.v_returns_pending` AS
SELECT
    r.rma_id,
    r.customer_id,
    r.invoice_no,
    r.stock_code,
    r.quantity,
    r.requested_at,
    DATE_DIFF(CURRENT_DATE(), DATE(r.requested_at), DAY) AS days_pending
FROM `acme-analytics.raw.return_authorizations` r
WHERE r.approved IS NULL OR r.approved = FALSE;
