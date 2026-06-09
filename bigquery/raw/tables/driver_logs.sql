-- BigQuery DDL: raw.driver_logs
-- Source: Hive raw.driver_logs (PARTITIONED BY date_ts STRING, JsonSerDe, STORED AS TEXTFILE)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- Complex types: gps STRUCT<lat DOUBLE, lon DOUBLE> → STRUCT<lat FLOAT64, lon FLOAT64>;
--                extras MAP<STRING,STRING> → JSON
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.driver_logs` (
  driver_id    STRING,
  event_ts     TIMESTAMP,
  event_type   STRING,
  gps          STRUCT<lat FLOAT64, lon FLOAT64>,
  notes        STRING,
  extras       JSON,
  partition_ts TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);
