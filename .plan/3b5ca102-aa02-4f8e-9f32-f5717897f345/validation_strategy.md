# Validation Strategy


### Validation Strategy: Staging DDL Conversion (AC-1 through AC-6)

#### Validation Framework
Node.js scripts following the established raw layer pattern (`/workspace/project/bigquery/raw/validation/`), using `@google-cloud/bigquery` for dry-runs and `hive-driver` for live Hive metastore connectivity.

#### AC-by-AC Validation Plan

##### AC-1: All 11 CREATE Statements Dry-Run with Zero Errors
- **Script**: `dry_run_tables.js` (10 tables) + `dry_run_views.js` (1 view)
- **Method**: Read each `.sql` file from `bigquery/staging/tables/` and `bigquery/staging/views/`, rewrite `acme-analytics.staging.` → `${TEST_BQ_PROJECT}.test.` (and `acme-analytics.raw.` → `${TEST_BQ_PROJECT}.test.` for the view), execute with `dryRun: true`
- **Pass criteria**: All 11 statements return `dryRun: true` success, zero BigQuery API errors

##### AC-2: dedup_clickstream Partition/Cluster Conversion
- **Script**: `ac_assertions.js` (assertion block for AC-2)
- **Checks** (6 assertions):
  1. DDL contains `PARTITION BY event_date` (single DATE column)
  2. DDL contains `CLUSTER BY country_partition, user_id`
  3. DDL does NOT contain `BUCKETS` or `CLUSTERED BY ... INTO`
  4. `event_date` column is declared as `DATE`
  5. `country_partition` is present as a regular STRING data column
  6. Original `date_ts` STRING partition column is absent from DDL
- **Method**: Static DDL file parsing (regex + AST extraction from the `.sql` file)

##### AC-3: Complex Type Mappings (MAP→JSON, ARRAY→repeated)
- **Script**: `ac_assertions.js` (assertion block for AC-3)
- **Checks** (4 assertions):
  1. `parsed_loyalty_events.meta` is declared as `JSON` type in DDL
  2. `fraud_scored.signals` is declared as `ARRAY<STRING>` in DDL
  3. Dry-run of `parsed_loyalty_events.sql` succeeds (validates JSON is a valid BQ type in context)
  4. Dry-run of `fraud_scored.sql` succeeds (validates ARRAY<STRING> syntax)
- **Method**: Static DDL parsing + BQ dry-run confirmation

##### AC-4: Schema Parity (Hive Source ↔ BigQuery Target)
- **Script**: `schema_parity.mjs`
- **Method**: Connect to live Hive metastore at `${HIVE_HOST}:${HIVE_PORT}`, run `DESCRIBE staging.<table>` for all 10 tables, compare column-by-column against parsed BQ DDL files
- **Checks per table**:
  1. Every Hive source column present in BQ target (except intentionally dropped `date_ts` partition columns)
  2. No unexpected columns in BQ target (except documented synthetic partition columns: `event_date`, `snapshot_date`)
  3. Every column type maps correctly per the scalar type mapping table
  4. Partition and cluster intent preserved
- **Type mapping rules** (hardcoded in script):
  - `STRING → STRING`, `INT → INT64`, `BIGINT → INT64`, `BOOLEAN → BOOL`
  - `DOUBLE → FLOAT64`, `TIMESTAMP → TIMESTAMP`, `DATE → DATE`
  - `DECIMAL(*) → NUMERIC`, `MAP<STRING,STRING> → JSON`, `ARRAY<STRING> → ARRAY<STRING>`
- **Pass criteria**: All 10 tables pass all 4 checks, zero mismatches

##### AC-5: Data-Survival Edge Value Probes (DECIMAL + DOUBLE)
- **Script**: `edge_value_probes.js`
- **Method**: Create temporary scratch tables in the test dataset, INSERT edge values, SELECT them back, compare
- **DECIMAL(14,2) probes** (target: `cleansed_orders.gross_amount`, `cleansed_orders.net_amount`):
  - `999999999999.99` (max positive 14,2)
  - `-999999999999.99` (max negative 14,2)
  - `0.01` (minimum non-zero)
  - `0.00` (exact zero)
  - Round-trip assertion: `inserted_value == selected_value` with zero tolerance
- **DOUBLE/FLOAT64 probes** (target: `cleansed_customers.geocoded_lat`, `cleansed_customers.geocoded_lon`):
  - `CAST('NaN' AS FLOAT64)` — assert `IS_NAN(result) = TRUE`
  - `CAST('+inf' AS FLOAT64)` — assert `IS_INF(result) = TRUE AND result > 0`
  - `CAST('-inf' AS FLOAT64)` — assert `IS_INF(result) = TRUE AND result < 0`
  - `CAST('-0.0' AS FLOAT64)` — assert `1.0 / result = CAST('-inf' AS FLOAT64)` (negative zero check)
- **Execution**: Uses BigQuery Jobs API (not dry-run — requires actual query execution against scratch dataset)
- **Pass criteria**: All 8 probe values round-trip exactly

##### AC-6: v_returns_pending View (Cross-Dataset + DATEDIFF Translation)
- **Script**: `dry_run_views.js` + `ac_assertions.js` (assertion block for AC-6)
- **Checks** (5 assertions):
  1. View DDL contains fully qualified reference `` `acme-analytics.raw.return_authorizations` ``
  2. View DDL uses `DATE_DIFF(CURRENT_DATE(), DATE(r.requested_at), DAY)` (not Hive's `DATEDIFF`)
  3. View DDL does NOT contain `DATEDIFF(` (Hive function)
  4. View DDL does NOT contain `to_date(` (Hive function)
  5. Dry-run of view against scratch dataset succeeds (requires `raw.return_authorizations` to exist in test dataset — either pre-created or re-pointed)
- **View dry-run dependency**: The view references `raw.return_authorizations`. For dry-run, the script must either:
  - Create a stub `test.return_authorizations` table first, OR
  - Rewrite the view DDL to point to the test dataset where the raw table DDL has already been deployed
- **Pass criteria**: All 5 assertions pass, dry-run returns success

#### Master Runner: `run_all_validation.sh`
Follows the raw layer's pattern:
```
Phase 1: BQ Dry-Run (10 tables + 1 view) — requires TEST_BQ_TOKEN
Phase 2: Schema Parity (Hive ↔ BQ) — requires HIVE_HOST/PORT
Phase 3: AC Assertion Suite (AC-1 through AC-6) — static + BQ
Phase 4: Edge Value Probes (AC-5) — requires BQ execution
```
Supports `--local-only` flag to skip BQ-dependent phases (runs static assertions + Hive parity only).

#### Output: VALIDATION_REPORT.md
Markdown summary table matching the raw layer's format:

| AC | Description | Status | Checks |
|----|-------------|--------|--------|
| AC-1 | All 11 DDLs dry-run with zero errors | ✅/❌ | n/11 |
| AC-2 | dedup_clickstream partition/cluster conversion | ✅/❌ | n/6 |
| AC-3 | MAP→JSON, ARRAY→repeated type mapping | ✅/❌ | n/4 |
| AC-4 | Schema parity: Hive source ↔ BQ target | ✅/❌ | n/10 tables |
| AC-5 | DECIMAL/DOUBLE edge value round-trip | ✅/❌ | n/8 probes |
| AC-6 | v_returns_pending cross-dataset + DATEDIFF | ✅/❌ | n/5 |

