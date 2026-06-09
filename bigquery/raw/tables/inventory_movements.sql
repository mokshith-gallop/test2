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
