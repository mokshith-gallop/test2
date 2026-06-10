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
