-- BigQuery DDL: raw.fraud_signals
-- Source: Hive raw.fraud_signals (Avro-backed, schema fraud_signals-v5.avsc;
--         PARTITIONED BY signal_date STRING; STORED AS AVRO)
-- Migration: signal_date STRING kept as regular column (used by v_fraud_signals_recent view),
--            partition on signal_ts TIMESTAMP via TIMESTAMP_TRUNC(signal_ts, DAY)
-- Avro type mappings:
--   union[null,string]  → STRING  (customer_id, signal_type, risk_band, vendor)
--   union[null,double]  → FLOAT64 (score)
--   union[null,array<string>] → ARRAY<STRING> (reason_codes)
--   union[null,long{timestamp-millis}] → TIMESTAMP (signal_ts)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.fraud_signals` (
  customer_id   STRING,
  signal_type   STRING,
  score         FLOAT64,
  risk_band     STRING,
  reason_codes  ARRAY<STRING>,
  signal_ts     TIMESTAMP,
  vendor        STRING,
  signal_date   STRING
)
PARTITION BY TIMESTAMP_TRUNC(signal_ts, DAY);
