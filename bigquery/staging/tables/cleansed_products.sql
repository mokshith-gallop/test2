-- BigQuery DDL: staging.cleansed_products
-- Source: Hive staging.cleansed_products (PARTITIONED BY load_date DATE, STORED AS PARQUET)
-- Migration: load_date DATE kept as-is — already native DATE, no transformation needed
-- Type mappings: DECIMAL(10,2) → NUMERIC, BOOLEAN → BOOL
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.cleansed_products` (
  sku            STRING,
  upc            STRING,
  name_norm      STRING,
  category_norm  STRING,
  subcategory    STRING,
  color_norm     STRING,
  size_norm      STRING,
  msrp           NUMERIC,
  cost           NUMERIC,
  supplier_id    STRING,
  available      BOOL,
  load_date      DATE
)
PARTITION BY load_date;
