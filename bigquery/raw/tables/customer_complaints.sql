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
