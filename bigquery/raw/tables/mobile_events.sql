-- BigQuery DDL: raw.mobile_events
-- Source: Hive raw.mobile_events (PARTITIONED BY event_date STRING, hour_bucket TINYINT;
--         JsonSerDe, STORED AS TEXTFILE)
-- Migration: event_date/hour_bucket partition columns dropped entirely,
--            replaced with synthetic event_timestamp TIMESTAMP partition column
--            (parsed from event_date + hour_bucket at load time)
-- Complex types: properties MAP<STRING,STRING> → JSON
--                context STRUCT<ip,country,session_id,referrer> preserved as STRUCT
--                items ARRAY<STRUCT<sku STRING, qty INT, price DECIMAL(10,2)>>
--                  → ARRAY<STRUCT<sku STRING, qty INT64, price NUMERIC>>
-- Clustering: CLUSTER BY platform (derived from platform field)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.mobile_events` (
  event_id        STRING,
  event_ts        TIMESTAMP,
  user_id         STRING,
  app_version     STRING,
  device_type     STRING,
  platform        STRING,
  properties      STRING,
  context         STRUCT<ip STRING, country STRING, session_id STRING, referrer STRING>,
  items           ARRAY<STRUCT<sku STRING, qty INT64, price NUMERIC>>,
  event_timestamp TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(event_timestamp, HOUR)
CLUSTER BY platform;
