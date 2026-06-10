# Locked Decisions for Story 3b5ca102-aa02-4f8e-9f32-f5717897f345

## Type Mapping

### Data Mapping: Hive Staging → BigQuery Staging (10 Tables + 1 View)

#### Scalar Type Mapping Table

| Hive Type | BigQuery Type | Notes |
|-----------|--------------|-------|
| `STRING` | `STRING` | Direct mapping |
| `INT` | `INT64` | BigQuery has no 32-bit integer |
| `BIGINT` | `INT64` | Direct mapping |
| `BOOLEAN` | `BOOL` | BigQuery uses `BOOL` |
| `DOUBLE` | `FLOAT64` | Supports NaN, ±Infinity, −0.0 (AC-5) |
| `TIMESTAMP` | `TIMESTAMP` | Direct mapping |
| `DATE` | `DATE` | Direct mapping |
| `DECIMAL(14,2)` | `NUMERIC` | BQ NUMERIC = precision 38, scale 9 — superset, zero-loss (AC-5) |
| `DECIMAL(12,2)` | `NUMERIC` | Matches raw layer precedent (`return_authorizations.refund_amount`) |
| `DECIMAL(10,2)` | `NUMERIC` | Fits within NUMERIC |
| `DECIMAL(8,2)` | `NUMERIC` | Fits within NUMERIC |
| `DECIMAL(5,4)` | `NUMERIC` | Fits within NUMERIC |
| `DECIMAL(4,3)` | `NUMERIC` | Fits within NUMERIC |
| `MAP<STRING,STRING>` | `JSON` | Per locked project decision & AC-3 |
| `ARRAY<STRING>` | `ARRAY<STRING>` | Native repeated field (AC-3) |

#### Partition Column Mapping

| Table | Hive Partition Col(s) | Action | BQ Partition Col | BQ Type |
|-------|----------------------|--------|-----------------|---------|
| `cleansed_orders` | `order_date DATE` | Keep as-is | `order_date` | `DATE` |
| `cleansed_customers` | `load_date DATE` | Keep as-is | `load_date` | `DATE` |
| `cleansed_products` | `load_date DATE` | Keep as-is | `load_date` | `DATE` |
| `dedup_clickstream` | `date_ts STRING`, `country_partition STRING` | Drop both; add synthetic `event_date`; promote `country_partition` to data column | `event_date` | `DATE` |
| `geocoded_addresses` | `load_date DATE` | Keep as-is | `load_date` | `DATE` |
| `parsed_loyalty_events` | `date_ts STRING` | Drop; add synthetic `event_date` | `event_date` | `DATE` |
| `merged_returns_cdc` | `snapshot_date DATE` | Keep as-is | `snapshot_date` | `DATE` |
| `normalized_carrier_events` | `date_ts STRING` | Drop; add synthetic `event_date` | `event_date` | `DATE` |
| `fraud_scored` | `score_date DATE` | Keep as-is | `score_date` | `DATE` |
| `warehouse_kpi_snapshot` | `date_ts STRING` | Drop; add synthetic `snapshot_date` | `snapshot_date` | `DATE` |

#### Column-Level Mapping for All 10 Tables

**1. cleansed_orders** — 11 data columns + 1 partition column

| Hive Column | Hive Type | BQ Column | BQ Type | Notes |
|-------------|-----------|-----------|---------|-------|
| `order_id` | STRING | `order_id` | STRING | |
| `customer_id` | STRING | `customer_id` | STRING | |
| `invoice_no` | STRING | `invoice_no` | STRING | |
| `txn_ts` | TIMESTAMP | `txn_ts` | TIMESTAMP | |
| `line_count` | INT | `line_count` | INT64 | |
| `gross_amount` | DECIMAL(14,2) | `gross_amount` | NUMERIC | AC-5 edge-value target |
| `discount` | DECIMAL(14,2) | `discount` | NUMERIC | |
| `tax` | DECIMAL(14,2) | `tax` | NUMERIC | |
| `net_amount` | DECIMAL(14,2) | `net_amount` | NUMERIC | AC-5 edge-value target |
| `tender_type` | STRING | `tender_type` | STRING | |
| `source_feed` | STRING | `source_feed` | STRING | |
| `order_date` | DATE (partition) | `order_date` | DATE (partition) | Kept as-is |

**2. cleansed_customers** — 14 data columns + 1 partition column

| Hive Column | Hive Type | BQ Column | BQ Type | Notes |
|-------------|-----------|-----------|---------|-------|
| `customer_id` | STRING | `customer_id` | STRING | |
| `email_norm` | STRING | `email_norm` | STRING | |
| `phone_norm` | STRING | `phone_norm` | STRING | |
| `first_name` | STRING | `first_name` | STRING | |
| `last_name` | STRING | `last_name` | STRING | |
| `addr_line1` | STRING | `addr_line1` | STRING | |
| `addr_city` | STRING | `addr_city` | STRING | |
| `addr_region` | STRING | `addr_region` | STRING | |
| `addr_country` | STRING | `addr_country` | STRING | |
| `addr_postal` | STRING | `addr_postal` | STRING | |
| `geocoded_lat` | DOUBLE | `geocoded_lat` | FLOAT64 | AC-5: NaN, ±Infinity, −0.0 |
| `geocoded_lon` | DOUBLE | `geocoded_lon` | FLOAT64 | AC-5: NaN, ±Infinity, −0.0 |
| `eff_from_ts` | TIMESTAMP | `eff_from_ts` | TIMESTAMP | |
| `record_hash` | STRING | `record_hash` | STRING | |
| `load_date` | DATE (partition) | `load_date` | DATE (partition) | Kept as-is |

**3. cleansed_products** — 11 data columns + 1 partition column

| Hive Column | Hive Type | BQ Column | BQ Type | Notes |
|-------------|-----------|-----------|---------|-------|
| `sku` | STRING | `sku` | STRING | |
| `upc` | STRING | `upc` | STRING | |
| `name_norm` | STRING | `name_norm` | STRING | |
| `category_norm` | STRING | `category_norm` | STRING | |
| `subcategory` | STRING | `subcategory` | STRING | |
| `color_norm` | STRING | `color_norm` | STRING | |
| `size_norm` | STRING | `size_norm` | STRING | |
| `msrp` | DECIMAL(10,2) | `msrp` | NUMERIC | |
| `cost` | DECIMAL(10,2) | `cost` | NUMERIC | |
| `supplier_id` | STRING | `supplier_id` | STRING | |
| `available` | BOOLEAN | `available` | BOOL | |
| `load_date` | DATE (partition) | `load_date` | DATE (partition) | Kept as-is |

**4. dedup_clickstream** — 9 data columns + 2 partition columns + 1 bucketing key → 10 data columns + synthetic partition (AC-2)

| Hive Column | Hive Type | BQ Column | BQ Type | Notes |
|-------------|-----------|-----------|---------|-------|
| `session_id` | STRING | `session_id` | STRING | |
| `user_id` | STRING | `user_id` | STRING | Bucketing key → CLUSTER BY |
| `event_ts` | TIMESTAMP | `event_ts` | TIMESTAMP | |
| `page_url` | STRING | `page_url` | STRING | |
| `referrer_url` | STRING | `referrer_url` | STRING | |
| `ip` | STRING | `ip` | STRING | |
| `country` | STRING | `country` | STRING | |
| `bot_score` | DECIMAL(4,3) | `bot_score` | NUMERIC | |
| `device_type` | STRING | `device_type` | STRING | |
| `date_ts` | STRING (partition) | — | DROPPED | Replaced by synthetic `event_date` |
| `country_partition` | STRING (partition) | `country_partition` | STRING | Promoted to data column + CLUSTER BY |
| — | — | `event_date` | DATE | **Synthetic** — parsed from `date_ts` at load time |
| **PARTITION BY** | | `event_date` | | Single DATE partition |
| **CLUSTER BY** | | `country_partition, user_id` | | Replaces BUCKETS + second partition |

**5. geocoded_addresses** — 10 data columns + 1 partition column

| Hive Column | Hive Type | BQ Column | BQ Type | Notes |
|-------------|-----------|-----------|---------|-------|
| `raw_addr_hash` | STRING | `raw_addr_hash` | STRING | |
| `addr_line1` | STRING | `addr_line1` | STRING | |
| `addr_city` | STRING | `addr_city` | STRING | |
| `addr_region` | STRING | `addr_region` | STRING | |
| `addr_country` | STRING | `addr_country` | STRING | |
| `addr_postal` | STRING | `addr_postal` | STRING | |
| `lat` | DOUBLE | `lat` | FLOAT64 | AC-5 edge-value candidate |
| `lon` | DOUBLE | `lon` | FLOAT64 | AC-5 edge-value candidate |
| `confidence` | DECIMAL(4,3) | `confidence` | NUMERIC | |
| `provider` | STRING | `provider` | STRING | |
| `load_date` | DATE (partition) | `load_date` | DATE (partition) | Kept as-is |

**6. parsed_loyalty_events** — 7 data columns + 1 partition column (AC-3: MAP→JSON)

| Hive Column | Hive Type | BQ Column | BQ Type | Notes |
|-------------|-----------|-----------|---------|-------|
| `event_ts` | TIMESTAMP | `event_ts` | TIMESTAMP | |
| `member_id` | STRING | `member_id` | STRING | |
| `event_type` | STRING | `event_type` | STRING | |
| `points` | INT | `points` | INT64 | |
| `store_id` | STRING | `store_id` | STRING | |
| `tx_id` | STRING | `tx_id` | STRING | |
| `meta` | MAP&lt;STRING,STRING&gt; | `meta` | **JSON** | AC-3: MAP→JSON per locked decision |
| `date_ts` | STRING (partition) | — | DROPPED | Replaced by synthetic `event_date` |
| — | — | `event_date` | DATE | **Synthetic** — parsed from `date_ts` |

**7. merged_returns_cdc** — 8 data columns + 1 partition column

| Hive Column | Hive Type | BQ Column | BQ Type | Notes |
|-------------|-----------|-----------|---------|-------|
| `return_id` | BIGINT | `return_id` | INT64 | |
| `invoice_no` | STRING | `invoice_no` | STRING | |
| `customer_sk` | BIGINT | `customer_sk` | INT64 | |
| `return_ts` | TIMESTAMP | `return_ts` | TIMESTAMP | |
| `refund_amount` | DECIMAL(12,2) | `refund_amount` | NUMERIC | |
| `reason_code` | STRING | `reason_code` | STRING | |
| `status` | STRING | `status` | STRING | |
| `is_deleted` | BOOLEAN | `is_deleted` | BOOL | |
| `snapshot_date` | DATE (partition) | `snapshot_date` | DATE (partition) | Kept as-is |

**8. normalized_carrier_events** — 7 data columns + 1 partition column

| Hive Column | Hive Type | BQ Column | BQ Type | Notes |
|-------------|-----------|-----------|---------|-------|
| `tracking_no` | STRING | `tracking_no` | STRING | |
| `carrier` | STRING | `carrier` | STRING | |
| `event_type` | STRING | `event_type` | STRING | |
| `event_ts` | TIMESTAMP | `event_ts` | TIMESTAMP | |
| `location_city` | STRING | `location_city` | STRING | |
| `location_region` | STRING | `location_region` | STRING | |
| `location_country` | STRING | `location_country` | STRING | |
| `date_ts` | STRING (partition) | — | DROPPED | Replaced by synthetic `event_date` |
| — | — | `event_date` | DATE | **Synthetic** — parsed from `date_ts` |

**9. fraud_scored** — 6 data columns + 1 partition column (AC-3: ARRAY&lt;STRING&gt;)

| Hive Column | Hive Type | BQ Column | BQ Type | Notes |
|-------------|-----------|-----------|---------|-------|
| `txn_id` | BIGINT | `txn_id` | INT64 | |
| `customer_id` | STRING | `customer_id` | STRING | |
| `fraud_score` | DECIMAL(5,4) | `fraud_score` | NUMERIC | |
| `risk_band` | STRING | `risk_band` | STRING | |
| `signals` | ARRAY&lt;STRING&gt; | `signals` | ARRAY&lt;STRING&gt; | AC-3: native repeated STRING |
| `scored_at` | TIMESTAMP | `scored_at` | TIMESTAMP | |
| `score_date` | DATE (partition) | `score_date` | DATE (partition) | Kept as-is |

**10. warehouse_kpi_snapshot** — 8 data columns + 1 partition column

| Hive Column | Hive Type | BQ Column | BQ Type | Notes |
|-------------|-----------|-----------|---------|-------|
| `warehouse_id` | STRING | `warehouse_id` | STRING | |
| `snapshot_ts` | TIMESTAMP | `snapshot_ts` | TIMESTAMP | |
| `units_in` | INT | `units_in` | INT64 | |
| `units_picked` | INT | `units_picked` | INT64 | |
| `units_shipped` | INT | `units_shipped` | INT64 | |
| `pick_rate_uph` | DECIMAL(8,2) | `pick_rate_uph` | NUMERIC | |
| `backlog_units` | INT | `backlog_units` | INT64 | |
| `avg_pick_ms` | INT | `avg_pick_ms` | INT64 | |
| `date_ts` | STRING (partition) | — | DROPPED | Replaced by synthetic `snapshot_date` |
| — | — | `snapshot_date` | DATE | **Synthetic** — parsed from `date_ts` |

#### View: v_returns_pending (AC-6)

| Source Expression | BigQuery Expression | Notes |
|-------------------|-------------------|-------|
| `raw.return_authorizations r` | `` `acme-analytics.raw.return_authorizations` r `` | Cross-dataset same-project reference |
| `r.rma_id` | `r.rma_id` (STRING) | Direct |
| `r.customer_id` | `r.customer_id` (STRING) | Direct |
| `r.invoice_no` | `r.invoice_no` (STRING) | Direct |
| `r.stock_code` | `r.stock_code` (STRING) | Direct |
| `r.quantity` | `r.quantity` (INT64) | Direct |
| `r.requested_at` | `r.requested_at` (TIMESTAMP) | Direct |
| `DATEDIFF(current_date(), to_date(r.requested_at))` | `DATE_DIFF(CURRENT_DATE(), DATE(r.requested_at), DAY)` | Function translation |
| `r.approved IS NULL OR r.approved = FALSE` | `r.approved IS NULL OR r.approved = FALSE` | Direct (BOOL in BQ) |

#### ER Diagram (BigQuery Target Schema)

```mermaid
erDiagram
    cleansed_orders {
        STRING order_id
        STRING customer_id
        STRING invoice_no
        TIMESTAMP txn_ts
        INT64 line_count
        NUMERIC gross_amount "DECIMAL 14,2"
        NUMERIC discount "DECIMAL 14,2"
        NUMERIC tax "DECIMAL 14,2"
        NUMERIC net_amount "DECIMAL 14,2"
        STRING tender_type
        STRING source_feed
        DATE order_date "PARTITION BY"
    }
    cleansed_customers {
        STRING customer_id
        STRING email_norm
        STRING phone_norm
        STRING first_name
        STRING last_name
        STRING addr_line1
        STRING addr_city
        STRING addr_region
        STRING addr_country
        STRING addr_postal
        FLOAT64 geocoded_lat
        FLOAT64 geocoded_lon
        TIMESTAMP eff_from_ts
        STRING record_hash
        DATE load_date "PARTITION BY"
    }
    cleansed_products {
        STRING sku
        STRING upc
        STRING name_norm
        STRING category_norm
        STRING subcategory
        STRING color_norm
        STRING size_norm
        NUMERIC msrp "DECIMAL 10,2"
        NUMERIC cost "DECIMAL 10,2"
        STRING supplier_id
        BOOL available
        DATE load_date "PARTITION BY"
    }
    dedup_clickstream {
        STRING session_id
        STRING user_id
        TIMESTAMP event_ts
        STRING page_url
        STRING referrer_url
        STRING ip
        STRING country
        NUMERIC bot_score "DECIMAL 4,3"
        STRING device_type
        STRING country_partition "CLUSTER BY"
        DATE event_date "PARTITION BY synthetic"
    }
    geocoded_addresses {
        STRING raw_addr_hash
        STRING addr_line1
        STRING addr_city
        STRING addr_region
        STRING addr_country
        STRING addr_postal
        FLOAT64 lat
        FLOAT64 lon
        NUMERIC confidence "DECIMAL 4,3"
        STRING provider
        DATE load_date "PARTITION BY"
    }
    parsed_loyalty_events {
        TIMESTAMP event_ts
        STRING member_id
        STRING event_type
        INT64 points
        STRING store_id
        STRING tx_id
        JSON meta "MAP to JSON"
        DATE event_date "PARTITION BY synthetic"
    }
    merged_returns_cdc {
        INT64 return_id
        STRING invoice_no
        INT64 customer_sk
        TIMESTAMP return_ts
        NUMERIC refund_amount "DECIMAL 12,2"
        STRING reason_code
        STRING status
        BOOL is_deleted
        DATE snapshot_date "PARTITION BY"
    }
    normalized_carrier_events {
        STRING tracking_no
        STRING carrier
        STRING event_type
        TIMESTAMP event_ts
        STRING location_city
        STRING location_region
        STRING location_country
        DATE event_date "PARTITION BY synthetic"
    }
    fraud_scored {
        INT64 txn_id
        STRING customer_id
        NUMERIC fraud_score "DECIMAL 5,4"
        STRING risk_band
        STRING signals "ARRAY of STRING repeated"
        TIMESTAMP scored_at
        DATE score_date "PARTITION BY"
    }
    warehouse_kpi_snapshot {
        STRING warehouse_id
        TIMESTAMP snapshot_ts
        INT64 units_in
        INT64 units_picked
        INT64 units_shipped
        NUMERIC pick_rate_uph "DECIMAL 8,2"
        INT64 backlog_units
        INT64 avg_pick_ms
        DATE snapshot_date "PARTITION BY synthetic"
    }
    v_returns_pending {
        STRING rma_id "from raw.return_authorizations"
        STRING customer_id
        STRING invoice_no
        STRING stock_code
        INT64 quantity
        TIMESTAMP requested_at
        INT64 days_pending "DATE_DIFF computed"
    }
```


## Validation Strategy

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


## Implementation Approach

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

