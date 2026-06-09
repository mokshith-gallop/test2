#!/usr/bin/env bash
# run_all_validation.sh
# Master validation script for raw BigQuery DDL migration.
# Runs all validation suites in order:
#   1. BigQuery dry-run (Group 1: 12 date_ts tables)
#   2. BigQuery dry-run (Groups 2-6: 5 specialty tables)
#   3. BigQuery dry-run (Group 7 + views: 2 Avro tables + 2 views)
#   4. Schema parity validation (Hive → BQ column-by-column comparison)
#   5. AC assertion suite (AC-1 through AC-14)
#
# Usage:
#   # With BigQuery dry-runs (requires BQ credentials):
#   set -a; source /workspace/.gallop/db.env; set +a
#   bash bigquery/raw/validation/run_all_validation.sh
#
#   # Schema parity + AC assertions only (no BQ credentials needed):
#   bash bigquery/raw/validation/run_all_validation.sh --local-only
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_ONLY=false

if [[ "${1:-}" == "--local-only" ]]; then
  LOCAL_ONLY=true
fi

PASS_COUNT=0
FAIL_COUNT=0
RESULTS=()

run_step() {
  local step_name="$1"
  local command="$2"

  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "  $step_name"
  echo "══════════════════════════════════════════════════════════════"

  if eval "$command"; then
    PASS_COUNT=$((PASS_COUNT + 1))
    RESULTS+=("✓ PASS  $step_name")
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    RESULTS+=("✗ FAIL  $step_name")
  fi
}

# ─── Phase 1: BigQuery Dry-Run Validation ─────────────────────────────────────
if [[ "$LOCAL_ONLY" == "false" ]]; then
  if [[ -z "${TEST_BQ_TOKEN:-}" ]]; then
    echo "WARNING: TEST_BQ_TOKEN not set. Skipping BigQuery dry-run tests."
    echo "  Run: set -a; source /workspace/.gallop/db.env; set +a"
    echo "  Or use: --local-only flag"
    RESULTS+=("⊘ SKIP  BigQuery dry-runs (no credentials)")
  else
    run_step "BQ Dry-Run: Group 1 (12 date_ts tables)" \
      "node '$SCRIPT_DIR/dry_run_group1.js'"

    run_step "BQ Dry-Run: Groups 2-6 (5 specialty tables)" \
      "node '$SCRIPT_DIR/dry_run_group2to6.js'"

    run_step "BQ Dry-Run: Group 7 + Views (2 Avro + 2 views)" \
      "node '$SCRIPT_DIR/dry_run_group7_views.js'"
  fi
else
  echo ""
  echo "  --local-only: Skipping BigQuery dry-run tests"
  RESULTS+=("⊘ SKIP  BigQuery dry-runs (--local-only)")
fi

# ─── Phase 2: Schema Parity Validation ────────────────────────────────────────
run_step "Schema Parity Validation (Hive → BQ column-by-column)" \
  "node '$SCRIPT_DIR/validate_schema_parity.js'"

# ─── Phase 3: AC Assertion Suite ──────────────────────────────────────────────
run_step "AC Assertion Suite (AC-1 through AC-14)" \
  "node '$SCRIPT_DIR/ac_assertions.js'"

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  VALIDATION SUMMARY"
echo "══════════════════════════════════════════════════════════════"
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo ""
echo "  Passed: $PASS_COUNT"
echo "  Failed: $FAIL_COUNT"
echo ""
if [[ $FAIL_COUNT -gt 0 ]]; then
  echo "  OVERALL RESULT: FAIL ✗"
  exit 1
else
  echo "  OVERALL RESULT: PASS ✓"
  exit 0
fi
