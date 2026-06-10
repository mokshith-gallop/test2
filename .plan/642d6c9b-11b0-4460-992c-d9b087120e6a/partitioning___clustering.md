# Partitioning & Clustering

### Partitioning & Clustering Strategy for 10 Staging Tables

Per the locked project decision **Partitioning & Clustering Strategy (Multi-Column → Single-Column)**, all tables are partitioned on a single DATE column and Hive bucketing is completely retired.

#### Group 1: 6 Tables with Native DATE Partitions (No Transformation)

These Hive tables already partition on a DATE column — kept as-is in BigQuery.

| Table | Partition Column | Cluster By |
|-------|-----------------|------------|
| `cleansed_orders` | `PARTITION BY order_date` | — |
| `cleansed_customers` | `PARTITION BY load_date` | — |
| `cleansed_products` | `PARTITION BY load_date` | — |
| `geocoded_addresses` | `PARTITION BY load_date` | — |
| `merged_returns_cdc` | `PARTITION BY snapshot_date` | — |
| `fraud_scored` | `PARTITION BY score_date` | — |

#### Group 2: 3 Tables with `date_ts STRING` → Synthetic `DATE` Partition

These tables have `PARTITIONED BY (date_ts STRING)` in Hive. The STRING partition column is **dropped** and replaced with a synthetic DATE column, populated during data loading by parsing the string value.

| Table | Dropped Column | Synthetic Column | Partition Expression |
|-------|---------------|-----------------|---------------------|
| `parsed_loyalty_events` | `date_ts STRING` | `event_date DATE` | `PARTITION BY event_date` |
| `normalized_carrier_events` | `date_ts STRING` | `event_date DATE` | `PARTITION BY event_date` |
| `warehouse_kpi_snapshot` | `date_ts STRING` | `snapshot_date DATE` | `PARTITION BY snapshot_date` |

#### Group 3: `dedup_clickstream` — Dual Partition + Bucketing → Single Partition + Clustering (AC-2)

This is the most complex transformation and directly tests AC-2:

**Source Hive:**
```
PARTITIONED BY (date_ts STRING, country_partition STRING)
CLUSTERED BY (user_id) INTO 16 BUCKETS
```

**Target BigQuery:**
```sql
PARTITION BY event_date
CLUSTER BY country_partition, user_id
```

Transformation details:
1. `date_ts STRING` → **dropped**, replaced by synthetic `event_date DATE`
2. `country_partition STRING` → **promoted** from partition column to regular data column, moved into `CLUSTER BY`
3. `CLUSTERED BY (user_id) INTO 16 BUCKETS` → `user_id` added to `CLUSTER BY` (buckets clause eliminated)
4. Final cluster order: `country_partition, user_id` (secondary partition dimension first, then bucketing key)

#### Data Loading Contract

For the 4 tables with synthetic DATE columns, the ETL/ingestion pipeline must:
- Parse the Hive `date_ts` string value into a native DATE
- Populate the synthetic column (`event_date` or `snapshot_date`) before writing to BigQuery
- The original `date_ts` value is **not** stored in BigQuery (no dual-column retention)
