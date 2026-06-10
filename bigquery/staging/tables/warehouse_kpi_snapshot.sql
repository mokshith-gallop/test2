-- BigQuery DDL: staging.warehouse_kpi_snapshot
-- Source: Hive staging.warehouse_kpi_snapshot (PARTITIONED BY date_ts STRING, STORED AS PARQUET)
-- Migration: date_ts STRING partition dropped, replaced with synthetic snapshot_date DATE
--            (parsed from date_ts at load time)
-- Type mappings: INT → INT64, DECIMAL(8,2) → NUMERIC
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.warehouse_kpi_snapshot` (
  warehouse_id   STRING,
  snapshot_ts    TIMESTAMP,
  units_in       INT64,
  units_picked   INT64,
  units_shipped  INT64,
  pick_rate_uph  NUMERIC,
  backlog_units  INT64,
  avg_pick_ms    INT64,
  snapshot_date  DATE
)
PARTITION BY snapshot_date;
