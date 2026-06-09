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
