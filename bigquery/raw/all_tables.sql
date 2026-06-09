-- ============================================================================
-- Master DDL: acme-analytics.raw
-- 17 tables + 2 views for the raw landing zone
-- Generated from individual DDL files in dependency order
-- Tables first (views' base tables before other tables), then views
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- Group 1: 12 tables with date_ts STRING → partition_ts TIMESTAMP (HOUR)
-- ──────────────────────────────────────────────────────────────────────────

-- BigQuery DDL: raw.omniture_logs
-- Source: Hive raw.omniture_logs (PARTITIONED BY date_ts STRING, STORED AS TEXTFILE, TSV)
-- 60 STRING columns (col_1 through col_60) — schema-drift-tolerant landing table
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.omniture_logs` (
  col_1  STRING,
  col_2  STRING,
  col_3  STRING,
  col_4  STRING,
  col_5  STRING,
  col_6  STRING,
  col_7  STRING,
  col_8  STRING,
  col_9  STRING,
  col_10 STRING,
  col_11 STRING,
  col_12 STRING,
  col_13 STRING,
  col_14 STRING,
  col_15 STRING,
  col_16 STRING,
  col_17 STRING,
  col_18 STRING,
  col_19 STRING,
  col_20 STRING,
  col_21 STRING,
  col_22 STRING,
  col_23 STRING,
  col_24 STRING,
  col_25 STRING,
  col_26 STRING,
  col_27 STRING,
  col_28 STRING,
  col_29 STRING,
  col_30 STRING,
  col_31 STRING,
  col_32 STRING,
  col_33 STRING,
  col_34 STRING,
  col_35 STRING,
  col_36 STRING,
  col_37 STRING,
  col_38 STRING,
  col_39 STRING,
  col_40 STRING,
  col_41 STRING,
  col_42 STRING,
  col_43 STRING,
  col_44 STRING,
  col_45 STRING,
  col_46 STRING,
  col_47 STRING,
  col_48 STRING,
  col_49 STRING,
  col_50 STRING,
  col_51 STRING,
  col_52 STRING,
  col_53 STRING,
  col_54 STRING,
  col_55 STRING,
  col_56 STRING,
  col_57 STRING,
  col_58 STRING,
  col_59 STRING,
  col_60 STRING,
  partition_ts TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);

-- BigQuery DDL: raw.sales_retail
-- Source: Hive raw.sales_retail (PARTITIONED BY date_ts STRING, STORED AS TEXTFILE, CSV)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.sales_retail` (
  invoice_no     STRING,
  stock_code     STRING,
  description    STRING,
  quantity       INT64,
  invoice_date   STRING,
  unit_price     NUMERIC,
  customer_id    STRING,
  country        STRING,
  partition_ts   TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);

-- BigQuery DDL: raw.pos_transactions
-- Source: Hive raw.pos_transactions (PARTITIONED BY date_ts STRING, STORED AS PARQUET)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.pos_transactions` (
  txn_id          INT64,
  store_id        STRING,
  register_id     STRING,
  cashier_id      STRING,
  customer_id     STRING,
  invoice_no      STRING,
  txn_ts          TIMESTAMP,
  line_count      INT64,
  gross_amount    NUMERIC,
  discount_amount NUMERIC,
  tax_amount      NUMERIC,
  tender_type     STRING,
  void_flag       BOOL,
  partition_ts    TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);

-- BigQuery DDL: raw.loyalty_events
-- Source: Hive raw.loyalty_events (PARTITIONED BY date_ts STRING, RegexSerDe, STORED AS TEXTFILE)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- SerDe handling: RegexSerDe removed — native BigQuery table (pre-parse via Dataproc Spark to GCS Parquet)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.loyalty_events` (
  event_ts_str   STRING,
  member_id      STRING,
  event_type     STRING,
  points         STRING,
  store_id       STRING,
  tx_id          STRING,
  meta_raw       STRING,
  partition_ts   TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);

-- BigQuery DDL: raw.email_campaign_clicks
-- Source: Hive raw.email_campaign_clicks (PARTITIONED BY date_ts STRING, JsonSerDe, STORED AS TEXTFILE)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- Complex types: geo STRUCT<country,region,city> preserved; utm MAP<STRING,STRING> → JSON
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.email_campaign_clicks` (
  campaign_id  STRING,
  send_id      STRING,
  recipient    STRING,
  clicked_at   TIMESTAMP,
  click_url    STRING,
  user_agent   STRING,
  ip_address   STRING,
  geo          STRUCT<country STRING, region STRING, city STRING>,
  utm          JSON,
  partition_ts TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);

-- BigQuery DDL: raw.return_authorizations
-- Source: Hive raw.return_authorizations (PARTITIONED BY date_ts STRING, STORED AS TEXTFILE, TSV)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.return_authorizations` (
  rma_id          STRING,
  customer_id     STRING,
  invoice_no      STRING,
  stock_code      STRING,
  quantity        INT64,
  reason_code     STRING,
  reason_text     STRING,
  requested_at    TIMESTAMP,
  approved        BOOL,
  refund_amount   NUMERIC,
  partition_ts    TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);

-- BigQuery DDL: raw.delivery_routes
-- Source: Hive raw.delivery_routes (PARTITIONED BY date_ts STRING, STORED AS TEXTFILE, CSV)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.delivery_routes` (
  route_id       STRING,
  driver_id      STRING,
  vehicle_id     STRING,
  planned_stops  INT64,
  actual_stops   INT64,
  miles_driven   NUMERIC,
  fuel_used      NUMERIC,
  start_ts       TIMESTAMP,
  end_ts         TIMESTAMP,
  partition_ts   TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);

-- BigQuery DDL: raw.driver_logs
-- Source: Hive raw.driver_logs (PARTITIONED BY date_ts STRING, JsonSerDe, STORED AS TEXTFILE)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- Complex types: gps STRUCT<lat DOUBLE, lon DOUBLE> → STRUCT<lat FLOAT64, lon FLOAT64>;
--                extras MAP<STRING,STRING> → JSON
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.driver_logs` (
  driver_id    STRING,
  event_ts     TIMESTAMP,
  event_type   STRING,
  gps          STRUCT<lat FLOAT64, lon FLOAT64>,
  notes        STRING,
  extras       JSON,
  partition_ts TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);

-- BigQuery DDL: raw.customer_complaints
-- Source: Hive raw.customer_complaints (PARTITIONED BY date_ts STRING, STORED AS TEXTFILE, TSV)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.customer_complaints` (
  complaint_id  STRING,
  customer_id   STRING,
  invoice_no    STRING,
  channel       STRING,
  severity      STRING,
  summary       STRING,
  body          STRING,
  created_at    TIMESTAMP,
  resolved_at   TIMESTAMP,
  csat_score    INT64,
  partition_ts  TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);

-- BigQuery DDL: raw.chat_transcripts
-- Source: Hive raw.chat_transcripts (PARTITIONED BY date_ts STRING, STORED AS TEXTFILE, TSV)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.chat_transcripts` (
  chat_id        STRING,
  customer_id    STRING,
  agent_id       STRING,
  started_at     TIMESTAMP,
  ended_at       TIMESTAMP,
  duration_sec   INT64,
  message_count  INT64,
  transcript     STRING,
  sentiment      NUMERIC,
  partition_ts   TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);

-- BigQuery DDL: raw.shipment_tracking
-- Source: Hive raw.shipment_tracking (PARTITIONED BY date_ts STRING, carrier_partition STRING; STORED AS TEXTFILE, CSV)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
--            carrier_partition moved from partition column to regular column, used for CLUSTER BY
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.shipment_tracking` (
  tracking_no      STRING,
  carrier          STRING,
  invoice_no       STRING,
  customer_id      STRING,
  shipped_at       TIMESTAMP,
  delivered_at     TIMESTAMP,
  status           STRING,
  last_location    STRING,
  estimated_eta    TIMESTAMP,
  carrier_partition STRING,
  partition_ts     TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR)
CLUSTER BY carrier_partition;

-- BigQuery DDL: raw.warehouse_picks
-- Source: Hive raw.warehouse_picks (PARTITIONED BY date_ts STRING, warehouse_id_partition STRING; STORED AS PARQUET)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
--            warehouse_id_partition moved from partition column to regular column, used for CLUSTER BY
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.warehouse_picks` (
  pick_id                INT64,
  warehouse_id           STRING,
  bin_id                 STRING,
  sku                    STRING,
  picker_id              STRING,
  quantity               INT64,
  picked_at              TIMESTAMP,
  duration_ms            INT64,
  warehouse_id_partition STRING,
  partition_ts           TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR)
CLUSTER BY warehouse_id_partition;

-- ──────────────────────────────────────────────────────────────────────────
-- Group 2-6: Specialty partitioned tables
-- ──────────────────────────────────────────────────────────────────────────

-- BigQuery DDL: raw.inventory_movements
-- Source: Hive raw.inventory_movements (PARTITIONED BY year INT, month INT, day INT; STORED AS PARQUET)
-- Migration: year/month/day partition columns dropped entirely,
--            replaced with synthetic movement_date DATE partition column
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.inventory_movements` (
  movement_id    INT64,
  sku            STRING,
  warehouse_id   STRING,
  bin_location   STRING,
  movement_type  STRING,
  quantity       INT64,
  movement_ts    TIMESTAMP,
  reference_doc  STRING,
  operator_id    STRING,
  reason_code    STRING,
  movement_date  DATE
)
PARTITION BY movement_date;

-- BigQuery DDL: raw.supplier_invoices
-- Source: Hive raw.supplier_invoices (PARTITIONED BY feed_year INT, feed_month INT; STORED AS SEQUENCEFILE)
-- Migration: feed_year/feed_month partition columns dropped entirely,
--            replaced with synthetic feed_date DATE (day defaults to 1st),
--            partitioned by DATE_TRUNC(feed_date, MONTH)
-- Complex types: ARRAY<STRUCT<sku STRING, qty INT, unit_price DECIMAL(10,2)>>
--                → ARRAY<STRUCT<sku STRING, qty INT64, unit_price NUMERIC>>
-- SerDe handling: SequenceFile removed — native BigQuery table
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.supplier_invoices` (
  invoice_no    STRING,
  supplier_id   STRING,
  invoice_date  DATE,
  due_date      DATE,
  total_amount  NUMERIC,
  currency      STRING,
  line_items    ARRAY<STRUCT<sku STRING, qty INT64, unit_price NUMERIC>>,
  raw_xml       STRING,
  feed_date     DATE
)
PARTITION BY DATE_TRUNC(feed_date, MONTH);

-- BigQuery DDL: raw.product_catalog_feed
-- Source: Hive raw.product_catalog_feed (PARTITIONED BY feed_date STRING; STORED AS RCFILE)
-- Migration: feed_date STRING partition → feed_date DATE partition
-- Complex types: metadata MAP<STRING,STRING> → JSON
-- SerDe handling: RCFile removed — native BigQuery table
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.product_catalog_feed` (
  sku             STRING,
  supplier_id     STRING,
  upc             STRING,
  name            STRING,
  category        STRING,
  subcategory     STRING,
  color           STRING,
  size            STRING,
  msrp            NUMERIC,
  cost            NUMERIC,
  available_from  DATE,
  discontinued_at DATE,
  metadata        JSON,
  feed_date       DATE
)
PARTITION BY feed_date;

-- BigQuery DDL: raw.mobile_events
-- Source: Hive raw.mobile_events (PARTITIONED BY event_date STRING, hour_bucket TINYINT;
--         JsonSerDe, STORED AS TEXTFILE)
-- Migration: event_date/hour_bucket partition columns dropped entirely,
--            replaced with synthetic event_timestamp TIMESTAMP partition column
--            (parsed from event_date + hour_bucket at load time)
-- Complex types: properties MAP<STRING,STRING> → JSON
--                context STRUCT<ip,country,session_id,referrer> preserved as STRUCT
--                items ARRAY<STRUCT<sku STRING, qty INT, price DECIMAL(10,2)>>
--                  → ARRAY<STRUCT<sku STRING, qty INT64, price NUMERIC>>
-- Clustering: CLUSTER BY platform (derived from platform field)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.mobile_events` (
  event_id        STRING,
  event_ts        TIMESTAMP,
  user_id         STRING,
  app_version     STRING,
  device_type     STRING,
  platform        STRING,
  properties      JSON,
  context         STRUCT<ip STRING, country STRING, session_id STRING, referrer STRING>,
  items           ARRAY<STRUCT<sku STRING, qty INT64, price NUMERIC>>,
  event_timestamp TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(event_timestamp, HOUR)
CLUSTER BY platform;

-- BigQuery DDL: raw.returns_cdc
-- Source: Hive raw.returns_cdc (PARTITIONED BY snapshot_date DATE; STORED AS TEXTFILE, CSV)
-- Migration: snapshot_date DATE kept as-is — already native DATE, no transformation needed
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.returns_cdc` (
  return_id      INT64,
  invoice_no     STRING,
  customer_sk    INT64,
  return_ts      TIMESTAMP,
  refund_amount  NUMERIC,
  reason_code    STRING,
  status         STRING,
  op             STRING,
  snapshot_date  DATE
)
PARTITION BY snapshot_date;

-- ──────────────────────────────────────────────────────────────────────────
-- Group 7: Avro-backed tables
-- ──────────────────────────────────────────────────────────────────────────

-- BigQuery DDL: raw.fraud_signals
-- Source: Hive raw.fraud_signals (Avro-backed, schema fraud_signals-v5.avsc;
--         PARTITIONED BY signal_date STRING; STORED AS AVRO)
-- Migration: signal_date STRING kept as regular column (used by v_fraud_signals_recent view),
--            partition on signal_ts TIMESTAMP via TIMESTAMP_TRUNC(signal_ts, DAY)
-- Avro type mappings:
--   union[null,string]  → STRING  (customer_id, signal_type, risk_band, vendor)
--   union[null,double]  → FLOAT64 (score)
--   union[null,array<string>] → ARRAY<STRING> (reason_codes)
--   union[null,long{timestamp-millis}] → TIMESTAMP (signal_ts)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.fraud_signals` (
  customer_id   STRING,
  signal_type   STRING,
  score         FLOAT64,
  risk_band     STRING,
  reason_codes  ARRAY<STRING>,
  signal_ts     TIMESTAMP,
  vendor        STRING,
  signal_date   STRING
)
PARTITION BY TIMESTAMP_TRUNC(signal_ts, DAY);

-- BigQuery DDL: raw.customer_signups
-- Source: Hive raw.customer_signups (Avro-backed, schema customer_signups-v3.avsc;
--         PARTITIONED BY signup_date STRING; STORED AS AVRO)
-- Migration: signup_date STRING → signup_date DATE partition column
-- Avro union mappings: 10× union[null,string] → STRING,
--                       1× union[null,boolean] → BOOL (marketing_opt_in)
-- 12 Avro fields as regular columns + signup_date as partition column = 13 total
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.customer_signups` (
  customer_id      STRING,
  email            STRING,
  phone            STRING,
  first_name       STRING,
  last_name        STRING,
  addr_line1       STRING,
  addr_city        STRING,
  addr_region      STRING,
  addr_country     STRING,
  addr_postal      STRING,
  signup_source    STRING,
  marketing_opt_in BOOL,
  signup_date      DATE
)
PARTITION BY signup_date;

-- ──────────────────────────────────────────────────────────────────────────
-- Views (depend on tables above)
-- ──────────────────────────────────────────────────────────────────────────

-- BigQuery DDL: raw.omniture (VIEW)
-- Source: Hive raw.omniture — thin projection view over raw.omniture_logs
-- Migration: date_ts reference changed to partition_ts (synthetic partition column)
-- Original Hive:
--   SELECT col_2 AS event_ts, col_8 AS ip, col_13 AS url, col_14 AS user_id,
--          col_50 AS city, col_51 AS country, col_53 AS state, date_ts
--   FROM raw.omniture_logs

CREATE OR REPLACE VIEW `acme-analytics.raw.omniture` AS
SELECT
    col_2        AS event_ts,
    col_8        AS ip,
    col_13       AS url,
    col_14       AS user_id,
    col_50       AS city,
    col_51       AS country,
    col_53       AS state,
    partition_ts
FROM `acme-analytics.raw.omniture_logs`;

-- BigQuery DDL: raw.v_fraud_signals_recent (VIEW)
-- Source: Hive raw.v_fraud_signals_recent — recent fraud signals (last 24h)
-- Migration: Hive date_format(date_sub(current_date(), 1), 'yyyyMMdd')
--          → BigQuery FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
-- Original Hive:
--   SELECT * FROM raw.fraud_signals
--   WHERE signal_date >= date_format(date_sub(current_date(), 1), 'yyyyMMdd')

CREATE OR REPLACE VIEW `acme-analytics.raw.v_fraud_signals_recent` AS
SELECT *
FROM `acme-analytics.raw.fraud_signals`
WHERE signal_date >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY));

