-- BigQuery DDL: raw.warehouse_picks
-- Source: Hive raw.warehouse_picks (PARTITIONED BY date_ts STRING, warehouse_id_partition STRING; STORED AS PARQUET)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
--            warehouse_id_partition moved from partition column to regular column, used for CLUSTER BY
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.warehouse_picks` (
  pick_id                INT64,
  warehouse_id           STRING,
  bin_id                 STRING,
  sku                    STRING,
  picker_id              STRING,
  quantity               INT64,
  picked_at              TIMESTAMP,
  duration_ms            INT64,
  warehouse_id_partition STRING,
  partition_ts           TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR)
CLUSTER BY warehouse_id_partition;
