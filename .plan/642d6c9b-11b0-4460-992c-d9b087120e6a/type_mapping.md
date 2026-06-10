# Type Mapping

### Hive → BigQuery Type Mapping for 10 Staging Tables + 1 View

All type mappings follow the locked project decision **MAP/STRUCT/ARRAY & SerDe Type Mapping Strategy** and are consistent with the already-implemented raw layer DDL under `bigquery/raw/`.

#### Scalar Type Mapping

| Hive Type | BigQuery Type | Affected Columns | Notes |
|-----------|--------------|------------------|-------|
| `STRING` | `STRING` | 48 columns across all 10 tables | Direct 1:1 mapping |
| `INT` | `INT64` | 9 columns (`line_count`, `points`, `units_in`, `units_picked`, `units_shipped`, `backlog_units`, `avg_pick_ms`) | Hive INT (32-bit) → BQ INT64 (64-bit), safe widening |
| `BIGINT` | `INT64` | 3 columns (`txn_id`, `return_id`, `customer_sk`) | Direct 1:1 mapping |
| `DECIMAL(p,s)` | `NUMERIC` | 12 columns across 8 tables (e.g. `net_amount`, `fraud_score`, `confidence`, `msrp`) | Bare NUMERIC per user decision. BQ NUMERIC (precision 38, scale 9) covers all source precisions including DECIMAL(14,2) for AC-7 |
| `DOUBLE` | `FLOAT64` | 4 columns (`geocoded_lat`, `geocoded_lon` on both `cleansed_customers` and `geocoded_addresses`) | IEEE 754 double-precision preserves 17 significant digits per AC-8 |
| `BOOLEAN` | `BOOL` | 3 columns (`available`, `is_deleted`, `approved` in view) | Direct mapping |
| `TIMESTAMP` | `TIMESTAMP` | 8 columns across 7 tables | Direct 1:1 mapping |
| `DATE` | `DATE` | 6 partition columns (kept as-is on tables with native DATE partitions) | No transformation needed |

#### Complex Type Mapping

| Hive Type | BigQuery Type | Affected Column | Table |
|-----------|--------------|-----------------|-------|
| `MAP<STRING,STRING>` | `JSON` | `meta` | `parsed_loyalty_events` |
| `ARRAY<STRING>` | `ARRAY<STRING>` | `signals` | `fraud_scored` |

Per locked project decision: MAP → JSON (not `ARRAY<STRUCT<key,value>>`). Downstream queries must use `JSON_VALUE(meta.key_name)` instead of Hive's `meta['key_name']`.

#### View Function Translation

| Hive Expression | BigQuery Expression | Location |
|-----------------|-------------------|----------|
| `DATEDIFF(current_date(), to_date(r.requested_at))` | `DATE_DIFF(CURRENT_DATE(), DATE(r.requested_at), DAY)` | `v_returns_pending` |

#### Cross-Dataset Reference

The view `v_returns_pending` references `raw.return_authorizations`. In BigQuery this becomes the fully-qualified path `` `acme-analytics.raw.return_authorizations` ``, consistent with the raw layer DDL already generated in this project. Both `raw` and `staging` datasets live within the same `acme-analytics` project.

#### Project ID Convention

All DDLs use **`acme-analytics`** as the BigQuery project ID, matching the existing raw-layer implementation. This is consistent across all 10 table DDLs, the view, the consolidated `all_tables.sql`, and all 5 validation scripts.
