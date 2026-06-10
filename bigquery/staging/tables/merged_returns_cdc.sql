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
