# Locked Decisions for Story 642d6c9b-11b0-4460-992c-d9b087120e6a

## Type Mapping
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

## Validation Strategy
### Validation Strategy for Staging DDL (8 Acceptance Criteria)

The existing implementation includes **5 comprehensive validation scripts** in `bigquery/staging/validation/`. Here's how they map to each acceptance criterion and what they verify:

#### AC-1: All DDL files exist and dry-run with zero errors
- **`ac_assertions.js`** — Checks that exactly 10 `.sql` files exist in `tables/` and 1 in `views/`, matching the expected file names.
- **`dry_run_tables.js`** — Sends each of the 10 table DDLs to BigQuery as a dry-run query (syntax-only, no data). Rewrites `acme-analytics.staging.` → test dataset for isolation. Reports pass/fail per table.
- **`dry_run_views.js`** — Creates a stub `return_authorizations` table in the test dataset (using the real raw-layer DDL), waits for metadata propagation, then dry-runs the `v_returns_pending` view DDL. Cleans up after.

#### AC-2: `dedup_clickstream` partition/cluster conversion
- **`ac_assertions.js`** — 8 checks: verifies `PARTITION BY event_date`, `CLUSTER BY country_partition, user_id`, no `BUCKETS`/`CLUSTERED BY`/`INTO 16` keywords, `event_date` is DATE, `country_partition` is STRING data column, `date_ts` is absent, no `STORED AS` directive.

#### AC-3: `parsed_loyalty_events.meta` is JSON (MAP→JSON)
- **`ac_assertions.js`** — Asserts `meta` column type is `JSON`, no `MAP<` present in DDL.

#### AC-4: `fraud_scored.signals` is ARRAY<STRING>
- **`ac_assertions.js`** — Asserts `signals` column type is `ARRAY<STRING>`, literal `ARRAY<STRING>` present in DDL.

#### AC-5: `v_returns_pending` cross-database reference
- **`ac_assertions.js`** — Verifies fully-qualified reference to `` `acme-analytics.raw.return_authorizations` ``, `DATE_DIFF(CURRENT_DATE(), DATE(r.requested_at), DAY)` function translation, no Hive `DATEDIFF(` or `to_date(` remnants, no bare unqualified `raw.return_authorizations`.
- **`dry_run_views.js`** — Validates the view actually compiles against BigQuery by creating stub dependencies and dry-running.

#### AC-6: Schema parity (every source column present, correct types)
- **`validate_schema_parity.js`** — The most comprehensive script. Parses the original Hive HQL (`06-staging-tables.hql`) and all 10 BigQuery DDLs. For each table:
  - Verifies every Hive data column exists in BQ with correctly mapped type
  - Verifies kept partition columns have correct types
  - Verifies dropped partition columns (`date_ts`) are absent
  - Verifies promoted partition columns (`country_partition`) are present as data columns
  - Verifies synthetic columns (`event_date`, `snapshot_date`) exist with DATE type
  - Verifies partition and cluster expressions match expected values
  - Verifies no unexpected columns added
  - Reports column count match

#### AC-7: DECIMAL(14,2) precision preservation
- **`edge_value_probes.js`** — Creates a scratch table with NUMERIC columns, inserts edge values (`999999999999.99`, `-999999999999.99`, `0.01`, `0.00`), reads back and asserts exact round-trip preservation. Tests against the actual BigQuery API.

#### AC-8: DOUBLE/FLOAT64 17-digit precision preservation
- **`edge_value_probes.js`** — Creates a scratch table with FLOAT64 columns, inserts special IEEE 754 values (`NaN`, `+Infinity`, `-Infinity`, `-0.0`), reads back using `IS_NAN()`, `IS_INF()`, and reciprocal checks. The 17-significant-digit test (`0.30000000000000004`) is covered by the FLOAT64 type guarantee — BigQuery FLOAT64 is IEEE 754 double-precision which stores exactly 53 binary digits (≈15.95 decimal digits of significand), and the value `0.30000000000000004` is representable exactly.

#### Execution Model
All scripts require:
- `TEST_BQ_TOKEN` — OAuth2 access token for BigQuery API
- `TEST_BQ_PROJECT` — GCP project ID with a `test` dataset

Scripts are organized in two tiers:
1. **Offline (no BQ access)**: `ac_assertions.js`, `validate_schema_parity.js` — parse DDL files locally
2. **Online (BQ API required)**: `dry_run_tables.js`, `dry_run_views.js`, `edge_value_probes.js` — execute against BigQuery

#### Gap: AC-8 explicit 17-digit probe
The `edge_value_probes.js` tests special FLOAT64 values but does not explicitly seed `0.30000000000000004` and read it back to verify 17-significant-digit preservation. This specific probe should be added to fully satisfy AC-8's literal wording. Implementation: insert `0.30000000000000004` into a FLOAT64 column, read back, and assert `CAST(value AS STRING) = '0.30000000000000004'`.

## Partitioning & Clustering
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
