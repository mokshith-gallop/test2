-- BigQuery DDL: raw.customer_signups
-- Source: Hive raw.customer_signups (Avro-backed, schema customer_signups-v3.avsc;
--         PARTITIONED BY signup_date STRING; STORED AS AVRO)
-- Migration: signup_date STRING → signup_date DATE partition column
-- Avro union mappings: 10× union[null,string] → STRING,
--                       1× union[null,boolean] → BOOL (marketing_opt_in)
-- 12 Avro fields as regular columns + signup_date as partition column = 13 total
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.customer_signups` (
  customer_id      STRING,
  email            STRING,
  phone            STRING,
  first_name       STRING,
  last_name        STRING,
  addr_line1       STRING,
  addr_city        STRING,
  addr_region      STRING,
  addr_country     STRING,
  addr_postal      STRING,
  signup_source    STRING,
  marketing_opt_in BOOL,
  signup_date      DATE
)
PARTITION BY signup_date;
