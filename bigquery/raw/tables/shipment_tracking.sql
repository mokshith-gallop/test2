-- BigQuery DDL: raw.shipment_tracking
-- Source: Hive raw.shipment_tracking (PARTITIONED BY date_ts STRING, carrier_partition STRING; STORED AS TEXTFILE, CSV)
-- Migration: date_ts STRING → partition_ts TIMESTAMP (HOUR granularity)
--            carrier_partition moved from partition column to regular column, used for CLUSTER BY
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.raw.shipment_tracking` (
  tracking_no      STRING,
  carrier          STRING,
  invoice_no       STRING,
  customer_id      STRING,
  shipped_at       TIMESTAMP,
  delivered_at     TIMESTAMP,
  status           STRING,
  last_location    STRING,
  estimated_eta    TIMESTAMP,
  carrier_partition STRING,
  partition_ts     TIMESTAMP
)
PARTITION BY TIMESTAMP_TRUNC(partition_ts, HOUR)
CLUSTER BY carrier_partition;
