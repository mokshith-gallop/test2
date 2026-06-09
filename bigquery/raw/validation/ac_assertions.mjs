#!/usr/bin/env node
/**
 * AC Assertion Suite (ESM version) — AC-2 through AC-14
 *
 * Programmatically parses each BigQuery DDL file and validates all
 * acceptance criteria with specific column-type, partition, and cluster checks.
 *
 * Run:
 *   node bigquery/raw/validation/ac_assertions.mjs
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const TABLES_DIR = '/workspace/project/bigquery/raw/tables';
const VIEWS_DIR  = '/workspace/project/bigquery/raw/views';

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

/** Split a string by delimiter, respecting <> () nesting. */
function splitTopLevel(s, delim) {
  const parts = [];
  let depth = 0, current = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '<' || ch === '(') depth++;
    if (ch === '>' || ch === ')') depth--;
    if (ch === delim && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseDDL(tableName, dir = TABLES_DIR) {
  const content = readFileSync(join(dir, `${tableName}.sql`), 'utf-8');
  const stripped = content.replace(/--.*$/gm, '').trim();

  // Extract column block
  const openParen = stripped.indexOf('(');
  let depth = 0, closeParen = -1;
  for (let i = openParen; i < stripped.length; i++) {
    if (stripped[i] === '(') depth++;
    if (stripped[i] === ')') depth--;
    if (depth === 0) { closeParen = i; break; }
  }
  const colBlock = stripped.substring(openParen + 1, closeParen);
  const entries = splitTopLevel(colBlock, ',');
  const columns = {};
  const columnOrder = [];
  for (let entry of entries) {
    entry = entry.replace(/\s+/g, ' ').trim();
    if (!entry) continue;
    const sp = entry.indexOf(' ');
    if (sp < 0) continue;
    const name = entry.substring(0, sp).trim().toLowerCase();
    const type = entry.substring(sp + 1).trim();
    columns[name] = type;
    columnOrder.push(name);
  }

  const afterCols = stripped.substring(closeParen + 1).trim();

  // PARTITION BY
  let partitionExpr = null;
  const partMatch = afterCols.match(/PARTITION\s+BY\s+(.+?)(?:\s*(?:CLUSTER|;|$))/si);
  if (partMatch) {
    partitionExpr = partMatch[1].trim().replace(/;$/, '').replace(/\n.*$/s, '').trim();
  }

  // CLUSTER BY
  let clusterBy = null;
  const clusterMatch = afterCols.match(/CLUSTER\s+BY\s+(\w+)/i);
  if (clusterMatch) clusterBy = clusterMatch[1].trim();

  return { columns, columnOrder, partitionExpr, clusterBy, raw: content };
}

function parseView(viewName) {
  const content = readFileSync(join(VIEWS_DIR, `${viewName}.sql`), 'utf-8');
  const sqlOnly = content.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n');
  return { raw: content, sql: sqlOnly };
}

function stripComments(content) {
  return content.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════
// Mini test framework
// ═══════════════════════════════════════════════════════════════════════
let totalTests = 0, passedTests = 0, failedTests = 0;
const results = [];

function assert(ac, desc, condition, detail) {
  totalTests++;
  if (condition) {
    passedTests++;
    results.push({ ac, desc, status: 'PASS' });
  } else {
    failedTests++;
    results.push({ ac, desc, status: 'FAIL', detail });
    console.log(`  ✗ [${ac}] ${desc}: ${detail}`);
  }
}
function assertEq(ac, d, a, e)  { assert(ac, d, a === e, `Expected "${e}", got "${a}"`); }
function assertInc(ac, d, h, n) { assert(ac, d, h && h.includes(n), `"${n}" not in "${h}"`); }
function assertNotInc(ac, d, h, n) { assert(ac, d, !h || !h.includes(n), `"${n}" should not be in "${h}"`); }
function assertCol(ac, d, cols, c) { assert(ac, d, c in cols, `Column ${c} missing`); }
function assertColType(ac, d, cols, c, e) {
  const a = cols[c];
  if (!a) { assert(ac, d, false, `Column ${c} missing`); return; }
  const nA = a.replace(/\s+/g, ' ').toUpperCase();
  const nE = e.replace(/\s+/g, ' ').toUpperCase();
  assert(ac, d, nA === nE, `${c}: expected "${nE}", got "${nA}"`);
}
function assertNoCol(ac, d, cols, c) { assert(ac, d, !(c in cols), `Column ${c} should be absent`); }

// ═══════════════════════════════════════════════════════════════════════
// AC-2: mobile_events — complex types + partition + cluster
// ═══════════════════════════════════════════════════════════════════════
function testAC2() {
  console.log('\nAC-2: mobile_events — complex types, partition, cluster');
  const d = parseDDL('mobile_events');

  assertColType('AC-2', 'properties is JSON', d.columns, 'properties', 'JSON');
  assertColType('AC-2', 'context is STRUCT<ip STRING, country STRING, session_id STRING, referrer STRING>',
    d.columns, 'context', 'STRUCT<ip STRING, country STRING, session_id STRING, referrer STRING>');
  assertColType('AC-2', 'items is ARRAY<STRUCT<sku STRING, qty INT64, price NUMERIC>>',
    d.columns, 'items', 'ARRAY<STRUCT<sku STRING, qty INT64, price NUMERIC>>');
  assertCol('AC-2', 'event_timestamp present', d.columns, 'event_timestamp');
  assertColType('AC-2', 'event_timestamp is TIMESTAMP', d.columns, 'event_timestamp', 'TIMESTAMP');
  assertEq('AC-2', 'partition by TIMESTAMP_TRUNC(event_timestamp, HOUR)',
    d.partitionExpr, 'TIMESTAMP_TRUNC(event_timestamp, HOUR)');
  assertEq('AC-2', 'cluster by platform', d.clusterBy, 'platform');
  assertNoCol('AC-2', 'event_date dropped', d.columns, 'event_date');
  assertNoCol('AC-2', 'hour_bucket dropped', d.columns, 'hour_bucket');
}

// ═══════════════════════════════════════════════════════════════════════
// AC-3: inventory_movements — movement_date DATE, no year/month/day
// ═══════════════════════════════════════════════════════════════════════
function testAC3() {
  console.log('\nAC-3: inventory_movements — synthetic movement_date');
  const d = parseDDL('inventory_movements');

  assertCol('AC-3', 'movement_date present', d.columns, 'movement_date');
  assertColType('AC-3', 'movement_date is DATE', d.columns, 'movement_date', 'DATE');
  assertEq('AC-3', 'partition by movement_date', d.partitionExpr, 'movement_date');
  assertNoCol('AC-3', 'year dropped', d.columns, 'year');
  assertNoCol('AC-3', 'month dropped', d.columns, 'month');
  assertNoCol('AC-3', 'day dropped', d.columns, 'day');
}

// ═══════════════════════════════════════════════════════════════════════
// AC-4: shipment_tracking — partition_ts HOUR + CLUSTER BY carrier
// ═══════════════════════════════════════════════════════════════════════
function testAC4() {
  console.log('\nAC-4: shipment_tracking — partition + cluster');
  const d = parseDDL('shipment_tracking');

  assertCol('AC-4', 'partition_ts present', d.columns, 'partition_ts');
  assertColType('AC-4', 'partition_ts is TIMESTAMP', d.columns, 'partition_ts', 'TIMESTAMP');
  assertEq('AC-4', 'partition by TIMESTAMP_TRUNC(partition_ts, HOUR)',
    d.partitionExpr, 'TIMESTAMP_TRUNC(partition_ts, HOUR)');
  assertCol('AC-4', 'carrier_partition as regular col', d.columns, 'carrier_partition');
  assertEq('AC-4', 'cluster by carrier_partition', d.clusterBy, 'carrier_partition');
  assertNoCol('AC-4', 'date_ts dropped', d.columns, 'date_ts');
}

// ═══════════════════════════════════════════════════════════════════════
// AC-5: warehouse_picks — partition_ts HOUR + CLUSTER BY warehouse_id
// ═══════════════════════════════════════════════════════════════════════
function testAC5() {
  console.log('\nAC-5: warehouse_picks — partition + cluster');
  const d = parseDDL('warehouse_picks');

  assertCol('AC-5', 'partition_ts present', d.columns, 'partition_ts');
  assertColType('AC-5', 'partition_ts is TIMESTAMP', d.columns, 'partition_ts', 'TIMESTAMP');
  assertEq('AC-5', 'partition by TIMESTAMP_TRUNC(partition_ts, HOUR)',
    d.partitionExpr, 'TIMESTAMP_TRUNC(partition_ts, HOUR)');
  assertCol('AC-5', 'warehouse_id_partition as regular col', d.columns, 'warehouse_id_partition');
  assertEq('AC-5', 'cluster by warehouse_id_partition', d.clusterBy, 'warehouse_id_partition');
  assertNoCol('AC-5', 'date_ts dropped', d.columns, 'date_ts');
}

// ═══════════════════════════════════════════════════════════════════════
// AC-6: product_catalog_feed — metadata JSON, no RCFile
// ═══════════════════════════════════════════════════════════════════════
function testAC6() {
  console.log('\nAC-6: product_catalog_feed — metadata JSON, native BQ');
  const d = parseDDL('product_catalog_feed');
  const sql = stripComments(d.raw).toLowerCase();

  assertColType('AC-6', 'metadata is JSON', d.columns, 'metadata', 'JSON');
  assertNotInc('AC-6', 'no RCFile reference in SQL', sql, 'rcfile');
  assertNotInc('AC-6', 'no STORED AS in SQL', sql, 'stored as');
  assertNotInc('AC-6', 'no SERDE in SQL', sql, 'serde');
  // Also verify feed_date partition
  assertCol('AC-6', 'feed_date present', d.columns, 'feed_date');
  assertColType('AC-6', 'feed_date is DATE', d.columns, 'feed_date', 'DATE');
  assertEq('AC-6', 'partition by feed_date', d.partitionExpr, 'feed_date');
}

// ═══════════════════════════════════════════════════════════════════════
// AC-7: supplier_invoices — ARRAY<STRUCT> line_items, no SequenceFile
// ═══════════════════════════════════════════════════════════════════════
function testAC7() {
  console.log('\nAC-7: supplier_invoices — line_items, native BQ');
  const d = parseDDL('supplier_invoices');
  const sql = stripComments(d.raw).toLowerCase();

  assertColType('AC-7', 'line_items is ARRAY<STRUCT<sku STRING, qty INT64, unit_price NUMERIC>>',
    d.columns, 'line_items', 'ARRAY<STRUCT<sku STRING, qty INT64, unit_price NUMERIC>>');
  assertNotInc('AC-7', 'no SEQUENCEFILE in SQL', sql, 'sequencefile');
  assertNotInc('AC-7', 'no STORED AS in SQL', sql, 'stored as');
  // Verify feed_date partition
  assertCol('AC-7', 'feed_date present', d.columns, 'feed_date');
  assertEq('AC-7', 'partition by DATE_TRUNC(feed_date, MONTH)',
    d.partitionExpr, 'DATE_TRUNC(feed_date, MONTH)');
  assertNoCol('AC-7', 'feed_year dropped', d.columns, 'feed_year');
  assertNoCol('AC-7', 'feed_month dropped', d.columns, 'feed_month');
}

// ═══════════════════════════════════════════════════════════════════════
// AC-8: email_campaign_clicks — geo STRUCT + utm JSON
// ═══════════════════════════════════════════════════════════════════════
function testAC8() {
  console.log('\nAC-8: email_campaign_clicks — geo STRUCT, utm JSON');
  const d = parseDDL('email_campaign_clicks');

  assertColType('AC-8', 'geo is STRUCT<country STRING, region STRING, city STRING>',
    d.columns, 'geo', 'STRUCT<country STRING, region STRING, city STRING>');
  assertColType('AC-8', 'utm is JSON', d.columns, 'utm', 'JSON');
}

// ═══════════════════════════════════════════════════════════════════════
// AC-9: driver_logs — gps STRUCT + extras JSON
// ═══════════════════════════════════════════════════════════════════════
function testAC9() {
  console.log('\nAC-9: driver_logs — gps STRUCT, extras JSON');
  const d = parseDDL('driver_logs');

  assertColType('AC-9', 'gps is STRUCT<lat FLOAT64, lon FLOAT64>',
    d.columns, 'gps', 'STRUCT<lat FLOAT64, lon FLOAT64>');
  assertColType('AC-9', 'extras is JSON', d.columns, 'extras', 'JSON');
}

// ═══════════════════════════════════════════════════════════════════════
// AC-10: customer_signups — 12 Avro fields, NULLABLE, correct types
// ═══════════════════════════════════════════════════════════════════════
function testAC10() {
  console.log('\nAC-10: customer_signups — 12 Avro fields');
  const d = parseDDL('customer_signups');

  const avroFields = [
    { name: 'customer_id',      type: 'STRING' },
    { name: 'email',            type: 'STRING' },
    { name: 'phone',            type: 'STRING' },
    { name: 'first_name',       type: 'STRING' },
    { name: 'last_name',        type: 'STRING' },
    { name: 'addr_line1',       type: 'STRING' },
    { name: 'addr_city',        type: 'STRING' },
    { name: 'addr_region',      type: 'STRING' },
    { name: 'addr_country',     type: 'STRING' },
    { name: 'addr_postal',      type: 'STRING' },
    { name: 'signup_source',    type: 'STRING' },
    { name: 'marketing_opt_in', type: 'BOOL' },
  ];

  assert('AC-10', '12 Avro fields + signup_date = 13 total columns',
    Object.keys(d.columns).length === 13,
    `Expected 13 columns, got ${Object.keys(d.columns).length}`);

  for (const f of avroFields) {
    assertColType('AC-10', `${f.name} is ${f.type}`, d.columns, f.name, f.type);
  }

  // All are NULLABLE by BigQuery default (no NOT NULL in DDL)
  const sql = stripComments(d.raw);
  assertNotInc('AC-10', 'no NOT NULL constraints (all NULLABLE)', sql, 'NOT NULL');

  // Partition check
  assertCol('AC-10', 'signup_date present', d.columns, 'signup_date');
  assertColType('AC-10', 'signup_date is DATE', d.columns, 'signup_date', 'DATE');
  assertEq('AC-10', 'partition by signup_date', d.partitionExpr, 'signup_date');
}

// ═══════════════════════════════════════════════════════════════════════
// AC-11: fraud_signals — signal_ts TIMESTAMP, reason_codes, score
// ═══════════════════════════════════════════════════════════════════════
function testAC11() {
  console.log('\nAC-11: fraud_signals — Avro type mappings');
  const d = parseDDL('fraud_signals');

  assertColType('AC-11', 'signal_ts is TIMESTAMP (timestamp-millis)', d.columns, 'signal_ts', 'TIMESTAMP');
  assertColType('AC-11', 'reason_codes is ARRAY<STRING>', d.columns, 'reason_codes', 'ARRAY<STRING>');
  assertColType('AC-11', 'score is FLOAT64 (union[null,double])', d.columns, 'score', 'FLOAT64');
  // signal_date kept as regular STRING col for view
  assertCol('AC-11', 'signal_date present', d.columns, 'signal_date');
  assertColType('AC-11', 'signal_date is STRING', d.columns, 'signal_date', 'STRING');
  // Partition on signal_ts
  assertEq('AC-11', 'partition by TIMESTAMP_TRUNC(signal_ts, DAY)',
    d.partitionExpr, 'TIMESTAMP_TRUNC(signal_ts, DAY)');
}

// ═══════════════════════════════════════════════════════════════════════
// AC-14: All 12 date_ts tables → partition_ts TIMESTAMP at HOUR
// ═══════════════════════════════════════════════════════════════════════
function testAC14() {
  console.log('\nAC-14: 12 date_ts tables → partition_ts TIMESTAMP HOUR');
  const tables = [
    'sales_retail', 'omniture_logs', 'pos_transactions', 'loyalty_events',
    'email_campaign_clicks', 'return_authorizations', 'delivery_routes',
    'driver_logs', 'customer_complaints', 'chat_transcripts',
    'shipment_tracking', 'warehouse_picks',
  ];

  for (const t of tables) {
    const d = parseDDL(t);
    assertCol('AC-14', `${t}: partition_ts present`, d.columns, 'partition_ts');
    assertColType('AC-14', `${t}: partition_ts is TIMESTAMP`, d.columns, 'partition_ts', 'TIMESTAMP');
    assertEq('AC-14', `${t}: partition by TIMESTAMP_TRUNC(partition_ts, HOUR)`,
      d.partitionExpr, 'TIMESTAMP_TRUNC(partition_ts, HOUR)');
    // Verify date_ts is NOT present
    assertNoCol('AC-14', `${t}: date_ts dropped`, d.columns, 'date_ts');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Main — run all AC tests
// ═══════════════════════════════════════════════════════════════════════

console.log('AC Assertion Suite (AC-2 through AC-14)');
console.log('========================================\n');

testAC2();
testAC3();
testAC4();
testAC5();
testAC6();
testAC7();
testAC8();
testAC9();
testAC10();
testAC11();
testAC14();

// ─── Summary ──────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log('AC ASSERTION SUITE SUMMARY');
console.log(`${'═'.repeat(60)}`);

const acGroups = {};
for (const r of results) {
  if (!acGroups[r.ac]) acGroups[r.ac] = { pass: 0, fail: 0, failures: [] };
  if (r.status === 'PASS') acGroups[r.ac].pass++;
  else { acGroups[r.ac].fail++; acGroups[r.ac].failures.push(`${r.desc}: ${r.detail}`); }
}

for (const [ac, g] of Object.entries(acGroups)) {
  const icon = g.fail === 0 ? '✓' : '✗';
  const label = g.fail === 0 ? 'PASS' : 'FAIL';
  console.log(`  ${icon} ${label}  ${ac}  (${g.pass + g.fail} checks, ${g.pass} passed, ${g.fail} failed)`);
  for (const f of g.failures) console.log(`         → ${f}`);
}

console.log(`\nTotal assertions: ${totalTests}`);
console.log(`Passed:           ${passedTests}`);
console.log(`Failed:           ${failedTests}`);
console.log(`\nOVERALL: ${failedTests === 0 ? '✅ ALL AC ASSERTIONS PASS' : '❌ FAILURES DETECTED'}`);
process.exit(failedTests > 0 ? 1 : 0);
