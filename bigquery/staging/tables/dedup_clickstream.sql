-- BigQuery DDL: staging.dedup_clickstream
-- Source: Hive staging.dedup_clickstream (PARTITIONED BY date_ts STRING, country_partition STRING;
--         bucketed by user_id into 16 hash splits; STORED AS PARQUET)
-- Migration: date_ts STRING partition dropped, replaced with synthetic event_date DATE
--            (parsed from date_ts at load time)
--            country_partition promoted from partition column to regular data column
--            Hive hash-bucketing retired — replaced with BigQuery CLUSTER BY
-- Type mappings: DECIMAL(4,3) → NUMERIC
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.dedup_clickstream` (
  session_id          STRING,
  user_id             STRING,
  event_ts            TIMESTAMP,
  page_url            STRING,
  referrer_url        STRING,
  ip                  STRING,
  country             STRING,
  bot_score           NUMERIC,
  device_type         STRING,
  country_partition   STRING,
  event_date          DATE
)
PARTITION BY event_date
CLUSTER BY country_partition, user_id;
