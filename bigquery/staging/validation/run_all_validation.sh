#!/usr/bin/env bash
# run_all_validation.sh
# Master validation script for staging BigQuery DDL migration.
# Runs all validation suites in order:
#   Phase 1 (offline): AC assertion suite + schema parity validation
#   Phase 2 (online):  BigQuery dry-runs (tables, views) + edge-value probes
#
# AC Coverage:
#   ac_assertions.js         → AC-1 through AC-8 (offline DDL checks)
#   validate_schema_parity.js → AC-6 (column-by-column Hive→BQ comparison)
#   dry_run_tables.js        → AC-1 (online syntax validation, 10 tables)
#   dry_run_views.js         → AC-1, AC-5 (online view compilation)
#   edge_value_probes.js     → AC-7 (NUMERIC round-trip), AC-8 (FLOAT64 round-trip)
#
# Usage:
#   # Full suite with BigQuery dry-runs (requires BQ credentials):
#   set -a; source /workspace/.gallop/db.env; set +a
#   bash bigquery/staging/validation/run_all_validation.sh
#
#   # Offline only — AC assertions + schema parity (no BQ credentials needed):
#   bash bigquery/staging/validation/run_all_validation.sh --local-only
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_ONLY=false

if [[ "${1:-}" == "--local-only" ]]; then
  LOCAL_ONLY=true
fi

# ─── Source credentials if available ──────────────────────────────────────────
if [[ -f /workspace/.gallop/db.env ]]; then
  set -a
  source /workspace/.gallop/db.env
  set +a
fi

# Ensure NODE_PATH is set for BigQuery client libraries
export NODE_PATH="${NODE_PATH:-/opt/workspace-mcp/node_modules}"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
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

skip_step() {
  local step_name="$1"
  local reason="$2"
  SKIP_COUNT=$((SKIP_COUNT + 1))
  RESULTS+=("⊘ SKIP  $step_name ($reason)")
}

# ─── Phase 1: Offline Validation (no BQ credentials needed) ──────────────────
echo ""
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  Phase 1: Offline Validation                                 │"
echo "└──────────────────────────────────────────────────────────────┘"

run_step "AC Assertion Suite (AC-1 through AC-8)" \
  "node '$SCRIPT_DIR/ac_assertions.js'"

run_step "Schema Parity Validation (Hive → BQ column-by-column, AC-6)" \
  "node '$SCRIPT_DIR/validate_schema_parity.js'"

# ─── Phase 2: Online BigQuery Validation ──────────────────────────────────────
echo ""
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  Phase 2: Online BigQuery Validation                         │"
echo "└──────────────────────────────────────────────────────────────┘"

if [[ "$LOCAL_ONLY" == "true" ]]; then
  echo ""
  echo "  --local-only: Skipping all BigQuery online tests"
  skip_step "BQ Dry-Run: 10 Staging Tables (AC-1)" "--local-only"
  skip_step "BQ Dry-Run: v_returns_pending View (AC-1, AC-5)" "--local-only"
  skip_step "Edge-Value Probes: NUMERIC + FLOAT64 (AC-7, AC-8)" "--local-only"
elif [[ -z "${TEST_BQ_TOKEN:-}" ]]; then
  echo ""
  echo "  WARNING: TEST_BQ_TOKEN not set. Skipping BigQuery online tests."
  echo "  Run: set -a; source /workspace/.gallop/db.env; set +a"
  echo "  Or use: --local-only flag"
  skip_step "BQ Dry-Run: 10 Staging Tables (AC-1)" "no credentials"
  skip_step "BQ Dry-Run: v_returns_pending View (AC-1, AC-5)" "no credentials"
  skip_step "Edge-Value Probes: NUMERIC + FLOAT64 (AC-7, AC-8)" "no credentials"
else
  run_step "BQ Dry-Run: 10 Staging Tables (AC-1)" \
    "node '$SCRIPT_DIR/dry_run_tables.js'"

  run_step "BQ Dry-Run: v_returns_pending View (AC-1, AC-5)" \
    "node '$SCRIPT_DIR/dry_run_views.js'"

  run_step "Edge-Value Probes: NUMERIC + FLOAT64 (AC-7, AC-8)" \
    "node '$SCRIPT_DIR/edge_value_probes.js'"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  STAGING DDL VALIDATION SUMMARY"
echo "══════════════════════════════════════════════════════════════"
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo ""
echo "  Passed:  $PASS_COUNT"
echo "  Failed:  $FAIL_COUNT"
echo "  Skipped: $SKIP_COUNT"
echo ""
if [[ $FAIL_COUNT -gt 0 ]]; then
  echo "  OVERALL RESULT: FAIL ✗"
  exit 1
else
  echo "  OVERALL RESULT: PASS ✓"
  exit 0
fi
