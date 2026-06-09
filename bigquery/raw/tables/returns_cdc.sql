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
