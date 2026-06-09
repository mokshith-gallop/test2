-- BigQuery DDL: raw.sales_retail
-- Source: Hive raw.sales_retail (PARTITIONED BY date_ts STRING, STORED AS TEXTFILE, CSV)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.sales_retail` (
  invoice_no     STRING,
  stock_code     STRING,
  description    STRING,
  quantity       INT64,
  invoice_date   STRING,
  unit_price     NUMERIC,
  customer_id    STRING,
  country        STRING,
  partition_ts   TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR);
