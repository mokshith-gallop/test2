-- BigQuery DDL: raw.supplier_invoices
-- Source: Hive raw.supplier_invoices (PARTITIONED BY feed_year INT, feed_month INT; STORED AS SEQUENCEFILE)
-- Migration: feed_year/feed_month partition columns dropped entirely,
--            replaced with synthetic feed_date DATE (day defaults to 1st),
--            partitioned by DATE_TRUNC(feed_date, MONTH)
-- Complex types: ARRAY<STRUCT<sku STRING, qty INT, unit_price DECIMAL(10,2)>>
--                → ARRAY<STRUCT<sku STRING, qty INT64, unit_price NUMERIC>>
-- SerDe handling: SequenceFile removed — native BigQuery table
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.supplier_invoices` (
  invoice_no    STRING,
  supplier_id   STRING,
  invoice_date  DATE,
  due_date      DATE,
  total_amount  NUMERIC,
  currency      STRING,
  line_items    ARRAY<STRUCT<sku STRING, qty INT64, unit_price NUMERIC>>,
  raw_xml       STRING,
  feed_date     DATE
)
PARTITION BY DATE_TRUNC(feed_date, MONTH);
