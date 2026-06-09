-- BigQuery DDL: raw.product_catalog_feed
-- Source: Hive raw.product_catalog_feed (PARTITIONED BY feed_date STRING; STORED AS RCFILE)
-- Migration: feed_date STRING partition → feed_date DATE partition
-- Complex types: metadata MAP<STRING,STRING> → JSON
-- SerDe handling: RCFile removed — native BigQuery table
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.product_catalog_feed` (
  sku             STRING,
  supplier_id     STRING,
  upc             STRING,
  name            STRING,
  category        STRING,
  subcategory     STRING,
  color           STRING,
  size            STRING,
  msrp            NUMERIC,
  cost            NUMERIC,
  available_from  DATE,
  discontinued_at DATE,
  metadata        JSON,
  feed_date       DATE
)
PARTITION BY feed_date;
