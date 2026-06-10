-- BigQuery DDL: staging.cleansed_customers
-- Source: Hive staging.cleansed_customers (PARTITIONED BY load_date DATE, STORED AS PARQUET)
-- Migration: load_date DATE kept as-is — already native DATE, no transformation needed
-- Type mappings: DOUBLE → FLOAT64
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.cleansed_customers` (
  customer_id     STRING,
  email_norm      STRING,
  phone_norm      STRING,
  first_name      STRING,
  last_name       STRING,
  addr_line1      STRING,
  addr_city       STRING,
  addr_region     STRING,
  addr_country    STRING,
  addr_postal     STRING,
  geocoded_lat    FLOAT64,
  geocoded_lon    FLOAT64,
  eff_from_ts     TIMESTAMP,
  record_hash     STRING,
  load_date       DATE
)
PARTITION BY load_date;
