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
