# Validation Strategy

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
