-- BigQuery DDL: raw.v_fraud_signals_recent (VIEW)
-- Source: Hive raw.v_fraud_signals_recent — recent fraud signals (last 24h)
-- Migration: Hive date_format(date_sub(current_date(), 1), 'yyyyMMdd')
--          → BigQuery FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
-- Original Hive:
--   SELECT * FROM raw.fraud_signals
--   WHERE signal_date >= date_format(date_sub(current_date(), 1), 'yyyyMMdd')

CREATE OR REPLACE VIEW `acme-analytics.raw.v_fraud_signals_recent` AS
SELECT *
FROM `acme-analytics.raw.fraud_signals`
WHERE signal_date >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY));
