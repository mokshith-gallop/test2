-- BigQuery DDL: staging.normalized_carrier_events
-- Source: Hive staging.normalized_carrier_events (PARTITIONED BY date_ts STRING, STORED AS PARQUET)
-- Migration: date_ts STRING partition dropped, replaced with synthetic event_date DATE
--            (parsed from date_ts at load time)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.normalized_carrier_events` (
  tracking_no      STRING,
  carrier          STRING,
  event_type       STRING,
  event_ts         TIMESTAMP,
  location_city    STRING,
  location_region  STRING,
  location_country STRING,
  event_date       DATE
)
PARTITION BY event_date;
