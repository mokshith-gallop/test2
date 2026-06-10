# Implementation Approach


### Implementation Approach: Staging Database DDL Conversion (10 Tables + 1 View)

#### File & Directory Structure
Follow the raw layer convention established in `/workspace/project/bigquery/raw/`:

```
bigquery/staging/
├── tables/                          # Individual DDL per table
│   ├── cleansed_orders.sql
│   ├── cleansed_customers.sql
│   ├── cleansed_products.sql
│   ├── dedup_clickstream.sql
│   ├── geocoded_addresses.sql
│   ├── parsed_loyalty_events.sql
│   ├── merged_returns_cdc.sql
│   ├── normalized_carrier_events.sql
│   ├── fraud_scored.sql
│   └── warehouse_kpi_snapshot.sql
├── views/
│   └── v_returns_pending.sql
├── all_tables.sql                   # Combined DDL in dependency order
└── validation/
    ├── dry_run_tables.js            # BQ dry-run for 10 tables
    ├── dry_run_views.js             # BQ dry-run for 1 view
    ├── schema_parity.mjs            # Hive↔BQ column-by-column comparison
    ├── ac_assertions.js             # AC-1 through AC-6 assertion suite
    ├── edge_value_probes.js         # AC-5 DECIMAL/DOUBLE round-trip seeding
    ├── run_all_validation.sh        # Master runner
    └── VALIDATION_REPORT.md         # Results summary
```

#### Target Dataset & Project ID
- **Project**: `acme-analytics` (matches the deployed raw layer)
- **Dataset**: `staging`
- **Fully qualified pattern**: `` `acme-analytics.staging.<table_name>` ``

#### DDL Generation Pattern
Each `.sql` file follows the raw layer's established commenting convention:
```sql
-- BigQuery DDL: staging.<table_name>
-- Source: Hive staging.<table_name> (partition info, storage format)
-- Migration: <partition transform description>
-- Type mappings: <notable type changes>
-- All columns NULLABLE (BigQuery default)

CREATE OR REPLACE TABLE `acme-analytics.staging.<table_name>` (
  ...
)
PARTITION BY <partition_expr>
CLUSTER BY <cluster_cols>;  -- where applicable
```

#### Partitioning Strategy (per locked project decision)

| Table | Hive Partition | BigQuery Partition | Cluster |
|-------|---------------|-------------------|---------|
| `cleansed_orders` | `order_date DATE` | `order_date` (native DATE) | — |
| `cleansed_customers` | `load_date DATE` | `load_date` (native DATE) | — |
| `cleansed_products` | `load_date DATE` | `load_date` (native DATE) | — |
| `dedup_clickstream` | `date_ts STRING, country_partition STRING` + `CLUSTERED BY user_id INTO 16 BUCKETS` | `event_date DATE` (synthetic, parsed from `date_ts`) | `country_partition, user_id` |
| `geocoded_addresses` | `load_date DATE` | `load_date` (native DATE) | — |
| `parsed_loyalty_events` | `date_ts STRING` | `event_date DATE` (synthetic, parsed from `date_ts`) | — |
| `merged_returns_cdc` | `snapshot_date DATE` | `snapshot_date` (native DATE) | — |
| `normalized_carrier_events` | `date_ts STRING` | `event_date DATE` (synthetic, parsed from `date_ts`) | — |
| `fraud_scored` | `score_date DATE` | `score_date` (native DATE) | — |
| `warehouse_kpi_snapshot` | `date_ts STRING` | `snapshot_date DATE` (synthetic, parsed from `date_ts`) | — |

- 6 tables with native `DATE` partition columns are preserved as-is.
- 4 tables with `date_ts STRING` partitions get a synthetic `DATE` column with daily granularity.
- `dedup_clickstream` bucketing (`CLUSTERED BY user_id INTO 16 BUCKETS`) is retired; `country_partition` and `user_id` become `CLUSTER BY` fields (AC-2).

#### View Translation (v_returns_pending — AC-6)
- **Cross-dataset reference**: `raw.return_authorizations` → `` `acme-analytics.raw.return_authorizations` `` (same-project cross-dataset)
- **Function translation**: `DATEDIFF(current_date(), to_date(r.requested_at))` → `DATE_DIFF(CURRENT_DATE(), DATE(r.requested_at), DAY)`

#### Validation Approach
Node.js scripts matching the raw layer pattern:
1. **Dry-run**: Execute all 11 `CREATE` statements against a scratch BQ dataset with `dryRun: true`
2. **Schema parity**: Live Hive metastore connection via `hive-driver` comparing column names/types against BQ DDL
3. **AC assertions**: Programmatic checks for each of the 6 acceptance criteria
4. **Edge-value probes**: Seed DECIMAL(14,2) edge values and DOUBLE special values (NaN, ±Infinity, −0.0) into scratch tables to verify round-trip (AC-5)

