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
