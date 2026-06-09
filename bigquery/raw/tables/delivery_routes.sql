-- BigQuery DDL: raw.delivery_routes
-- Source: Hive raw.delivery_routes (PARTITIONED BY date_ts STRING, STORED AS TEXTFILE, CSV)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.delivery_routes` (
  route_id       STRING,
  driver_id      STRING,
  vehicle_id     STRING,
  planned_stops  INT64,
  actual_stops   INT64,
  miles_driven   NUMERIC,
  fuel_used      NUMERIC,
  start_ts       TIMESTAMP,
  end_ts         TIMESTAMP,
  partition_ts   TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);
