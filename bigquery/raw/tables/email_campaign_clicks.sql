-- BigQuery DDL: raw.email_campaign_clicks
-- Source: Hive raw.email_campaign_clicks (PARTITIONED BY date_ts STRING, JsonSerDe, STORED AS TEXTFILE)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- Complex types: geo STRUCT<country,region,city> preserved; utm MAP<STRING,STRING> → JSON
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.email_campaign_clicks` (
  campaign_id  STRING,
  send_id      STRING,
  recipient    STRING,
  clicked_at   TIMESTAMP,
  click_url    STRING,
  user_agent   STRING,
  ip_address   STRING,
  geo          STRUCT<country STRING, region STRING, city STRING>,
  utm          JSON,
  partition_ts TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);
