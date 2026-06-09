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
