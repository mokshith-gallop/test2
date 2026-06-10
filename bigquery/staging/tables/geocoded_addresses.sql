-- BigQuery DDL: staging.geocoded_addresses
-- Source: Hive staging.geocoded_addresses (PARTITIONED BY load_date DATE, STORED AS PARQUET)
-- Migration: load_date DATE kept as-is — already native DATE, no transformation needed
-- Type mappings: DOUBLE → FLOAT64, DECIMAL(4,3) → NUMERIC
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.geocoded_addresses` (
  raw_addr_hash  STRING,
  addr_line1     STRING,
  addr_city      STRING,
  addr_region    STRING,
  addr_country   STRING,
  addr_postal    STRING,
  lat            FLOAT64,
  lon            FLOAT64,
  confidence     NUMERIC,
  provider       STRING,
  load_date      DATE
)
PARTITION BY load_date;
