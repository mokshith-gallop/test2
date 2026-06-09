-- BigQuery DDL: raw.omniture (VIEW)
-- Source: Hive raw.omniture — thin projection view over raw.omniture_logs
-- Migration: date_ts reference changed to partition_ts (synthetic partition column)
-- Original Hive:
--   SELECT col_2 AS event_ts, col_8 AS ip, col_13 AS url, col_14 AS user_id,
--          col_50 AS city, col_51 AS country, col_53 AS state, date_ts
--   FROM raw.omniture_logs

CREATE OR REPLACE VIEW `acme-analytics.raw.omniture` AS
SELECT
    col_2        AS event_ts,
    col_8        AS ip,
    col_13       AS url,
    col_14       AS user_id,
    col_50       AS city,
    col_51       AS country,
    col_53       AS state,
    partition_ts
FROM `acme-analytics.raw.omniture_logs`;
