-- BigQuery DDL: raw.chat_transcripts
-- Source: Hive raw.chat_transcripts (PARTITIONED BY date_ts STRING, STORED AS TEXTFILE, TSV)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.chat_transcripts` (
  chat_id        STRING,
  customer_id    STRING,
  agent_id       STRING,
  started_at     TIMESTAMP,
  ended_at       TIMESTAMP,
  duration_sec   INT64,
  message_count  INT64,
  transcript     STRING,
  sentiment      NUMERIC,
  partition_ts   TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);
