-- BigQuery DDL: staging.fraud_scored
-- Source: Hive staging.fraud_scored (PARTITIONED BY score_date DATE, STORED AS PARQUET)
-- Migration: score_date DATE kept as-is — already native DATE, no transformation needed
-- Type mappings: BIGINT → INT64, DECIMAL(5,4) → NUMERIC, ARRAY<STRING> → ARRAY<STRING>
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.fraud_scored` (
  txn_id         INT64,
  customer_id    STRING,
  fraud_score    NUMERIC,
  risk_band      STRING,
  signals        ARRAY<STRING>,
  scored_at      TIMESTAMP,
  score_date     DATE
)
PARTITION BY score_date;
