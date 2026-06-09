/**
 * ac_assertions.js
 *
 * Acceptance Criteria assertion suite (AC-2 through AC-14).
 * Each test function parses the generated DDL file and asserts
 * the exact column types, partition expressions, and cluster-by clauses.
 */

const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const TABLES_DIR = '/workspace/project/bigquery/raw/tables';
const VIEWS_DIR  = '/workspace/project/bigquery/raw/views';

// ─── Helpers ───────────────────────────────────────────────────────

/** Split a string by delimiter, respecting <> () nesting */
function splitTopLevel(s, delim) {
  const parts = [];
  let depth = 0, parenDepth = 0, current = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '<') depth++;
    if (ch === '>') depth--;
    if (ch === '(') parenDepth++;
    if (ch === ')') parenDepth--;
    if (ch === delim && depth === 0 && parenDepth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseDDL(tableName, dir) {
  dir = dir || TABLES_DIR;
  const content = readFileSync(join(dir, `${tableName}.sql`), 'utf-8');
  const stripped = content.replace(/--.*$/gm, '').trim();

  // Extract columns
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
  for (let entry of entries) {
    entry = entry.replace(/\s+/g, ' ').trim();
    if (!entry) continue;
    const sp = entry.indexOf(' ');
    if (sp < 0) continue;
    const name = entry.substring(0, sp).trim().toLowerCase();
    const type = entry.substring(sp + 1).trim();
    columns[name] = type;
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

  return { columns, partitionExpr, clusterBy, raw: content };
}

function parseView(viewName) {
  const content = readFileSync(join(VIEWS_DIR, `${viewName}.sql`), 'utf-8');
  // Strip comment lines for assertion checks on the SQL body
  const sqlOnly = content.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n');
  return { raw: content, sql: sqlOnly };
}

/** Strip comment lines from DDL content — returns only executable SQL */
function stripComments(content) {
  return content.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n');
}

// ─── Test Framework ────────────────────────────────────────────────
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
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

function assertEq(ac, desc, actual, expected) {
  assert(ac, desc, actual === expected, `Expected "${expected}", got "${actual}"`);
}

function assertIncludes(ac, desc, haystack, needle) {
  assert(ac, desc, haystack && haystack.includes(needle),
    `"${needle}" not found in "${haystack}"`);
}

function assertNotIncludes(ac, desc, haystack, needle) {
  assert(ac, desc, !haystack || !haystack.includes(needle),
    `"${needle}" should not be in "${haystack}"`);
}

function assertHasCol(ac, desc, columns, colName) {
  assert(ac, desc, colName in columns, `Column ${colName} missing`);
}

function assertColType(ac, desc, columns, colName, expectedType) {
  const actual = columns[colName];
  if (!actual) {
    assert(ac, desc, false, `Column ${colName} missing`);
  } else {
    const normA = actual.replace(/\s+/g, ' ').toUpperCase();
    const normE = expectedType.replace(/\s+/g, ' ').toUpperCase();
    assert(ac, desc, normA === normE,
      `Column ${colName}: expected "${normE}", got "${normA}"`);
  }
}

function assertColAbsent(ac, desc, columns, colName) {
  assert(ac, desc, !(colName in columns), `Column ${colName} should be absent`);
}

// ─── AC-1: All 17 tables dry-run OK ───────────────────────────────
function testAC1() {
  console.log('\nAC-1: 17 tables + 2 views DDL files exist');
  const tableFiles = readdirSync(TABLES_DIR).filter(f => f.endsWith('.sql'));

  const expectedTables = [
    'sales_retail', 'omniture_logs', 'returns_cdc', 'pos_transactions',
    'inventory_movements', 'loyalty_events', 'product_catalog_feed',
    'supplier_invoices', 'email_campaign_clicks', 'shipment_tracking',
    'return_authorizations', 'warehouse_picks', 'delivery_routes',
    'driver_logs', 'customer_complaints', 'chat_transcripts', 'mobile_events',
    'customer_signups', 'fraud_signals'
  ];

  // Check all 19 table DDL files exist (17 required + 2 Avro = 19)
  assert('AC-1', 'All 19 table DDL files exist (17 + 2 Avro)',
    tableFiles.length >= 19,
    `Found ${tableFiles.length} files, expected at least 19`);

  for (const t of expectedTables) {
    assert('AC-1', `${t}.sql exists`, tableFiles.includes(`${t}.sql`),
      `${t}.sql not found`);
  }

  const viewFiles = readdirSync(VIEWS_DIR).filter(f => f.endsWith('.sql'));
  assert('AC-1', '2 view DDL files exist', viewFiles.length === 2,
    `Found ${viewFiles.length} files, expected 2`);
}

// ─── AC-2: mobile_events complex types + partition + cluster ──────
function testAC2() {
  console.log('\nAC-2: mobile_events');
  const ddl = parseDDL('mobile_events');

  assertColType('AC-2', 'properties is JSON', ddl.columns, 'properties', 'JSON');
  assertColType('AC-2', 'context is STRUCT<ip STRING, country STRING, session_id STRING, referrer STRING>',
    ddl.columns, 'context', 'STRUCT<ip STRING, country STRING, session_id STRING, referrer STRING>');
  assertColType('AC-2', 'items is ARRAY<STRUCT<sku STRING, qty INT64, price NUMERIC>>',
    ddl.columns, 'items', 'ARRAY<STRUCT<sku STRING, qty INT64, price NUMERIC>>');
  assertEq('AC-2', 'partition by TIMESTAMP_TRUNC(event_timestamp, HOUR)',
    ddl.partitionExpr, 'TIMESTAMP_TRUNC(event_timestamp, HOUR)');
  assertEq('AC-2', 'cluster by platform', ddl.clusterBy, 'platform');
  assertColAbsent('AC-2', 'event_date dropped', ddl.columns, 'event_date');
  assertColAbsent('AC-2', 'hour_bucket dropped', ddl.columns, 'hour_bucket');
  assertHasCol('AC-2', 'event_timestamp present', ddl.columns, 'event_timestamp');
  assertColType('AC-2', 'event_timestamp is TIMESTAMP', ddl.columns, 'event_timestamp', 'TIMESTAMP');
}

// ─── AC-3: inventory_movements — synthetic movement_date ──────────
function testAC3() {
  console.log('\nAC-3: inventory_movements');
  const ddl = parseDDL('inventory_movements');

  assertHasCol('AC-3', 'movement_date present', ddl.columns, 'movement_date');
  assertColType('AC-3', 'movement_date is DATE', ddl.columns, 'movement_date', 'DATE');
  assertEq('AC-3', 'partition by movement_date', ddl.partitionExpr, 'movement_date');
  assertColAbsent('AC-3', 'year dropped', ddl.columns, 'year');
  assertColAbsent('AC-3', 'month dropped', ddl.columns, 'month');
  assertColAbsent('AC-3', 'day dropped', ddl.columns, 'day');
}

// ─── AC-4: shipment_tracking — partition + cluster ────────────────
function testAC4() {
  console.log('\nAC-4: shipment_tracking');
  const ddl = parseDDL('shipment_tracking');

  assertEq('AC-4', 'partition by TIMESTAMP_TRUNC(partition_ts, HOUR)',
    ddl.partitionExpr, 'TIMESTAMP_TRUNC(partition_ts, HOUR)');
  assertEq('AC-4', 'cluster by carrier_partition', ddl.clusterBy, 'carrier_partition');
  assertHasCol('AC-4', 'carrier_partition as regular col', ddl.columns, 'carrier_partition');
  assertHasCol('AC-4', 'partition_ts present', ddl.columns, 'partition_ts');
}

// ─── AC-5: warehouse_picks — partition + cluster ──────────────────
function testAC5() {
  console.log('\nAC-5: warehouse_picks');
  const ddl = parseDDL('warehouse_picks');

  assertEq('AC-5', 'partition by TIMESTAMP_TRUNC(partition_ts, HOUR)',
    ddl.partitionExpr, 'TIMESTAMP_TRUNC(partition_ts, HOUR)');
  assertEq('AC-5', 'cluster by warehouse_id_partition', ddl.clusterBy, 'warehouse_id_partition');
  assertHasCol('AC-5', 'warehouse_id_partition as regular col', ddl.columns, 'warehouse_id_partition');
  assertHasCol('AC-5', 'partition_ts present', ddl.columns, 'partition_ts');
}

// ─── AC-6: product_catalog_feed — metadata JSON, no RCFile ───────
function testAC6() {
  console.log('\nAC-6: product_catalog_feed');
  const ddl = parseDDL('product_catalog_feed');
  const sqlBody = stripComments(ddl.raw).toLowerCase();

  assertColType('AC-6', 'metadata is JSON', ddl.columns, 'metadata', 'JSON');
  assertNotIncludes('AC-6', 'no RCFile reference in SQL body', sqlBody, 'rcfile');
  assertNotIncludes('AC-6', 'no STORED AS in SQL body', sqlBody, 'stored as');
  assertNotIncludes('AC-6', 'no SERDE in SQL body', sqlBody, 'serde');
}

// ─── AC-7: supplier_invoices — line_items ARRAY<STRUCT>, no SeqFile
function testAC7() {
  console.log('\nAC-7: supplier_invoices');
  const ddl = parseDDL('supplier_invoices');
  const sqlBody = stripComments(ddl.raw).toLowerCase();

  assertColType('AC-7', 'line_items is ARRAY<STRUCT<sku STRING, qty INT64, unit_price NUMERIC>>',
    ddl.columns, 'line_items', 'ARRAY<STRUCT<sku STRING, qty INT64, unit_price NUMERIC>>');
  assertNotIncludes('AC-7', 'no SEQUENCEFILE reference in SQL body', sqlBody, 'sequencefile');
  assertNotIncludes('AC-7', 'no STORED AS in SQL body', sqlBody, 'stored as');
}

// ─── AC-8: email_campaign_clicks — geo STRUCT, utm JSON ──────────
function testAC8() {
  console.log('\nAC-8: email_campaign_clicks');
  const ddl = parseDDL('email_campaign_clicks');

  assertColType('AC-8', 'geo is STRUCT<country STRING, region STRING, city STRING>',
    ddl.columns, 'geo', 'STRUCT<country STRING, region STRING, city STRING>');
  assertColType('AC-8', 'utm is JSON', ddl.columns, 'utm', 'JSON');
}

// ─── AC-9: driver_logs — gps STRUCT, extras JSON ─────────────────
function testAC9() {
  console.log('\nAC-9: driver_logs');
  const ddl = parseDDL('driver_logs');

  assertColType('AC-9', 'gps is STRUCT<lat FLOAT64, lon FLOAT64>',
    ddl.columns, 'gps', 'STRUCT<lat FLOAT64, lon FLOAT64>');
  assertColType('AC-9', 'extras is JSON', ddl.columns, 'extras', 'JSON');
}

// ─── AC-10: customer_signups — 12 Avro fields + partition ────────
function testAC10() {
  console.log('\nAC-10: customer_signups');
  const ddl = parseDDL('customer_signups');

  const expectedFields = [
    { name: 'customer_id', type: 'STRING' },
    { name: 'email', type: 'STRING' },
    { name: 'phone', type: 'STRING' },
    { name: 'first_name', type: 'STRING' },
    { name: 'last_name', type: 'STRING' },
    { name: 'addr_line1', type: 'STRING' },
    { name: 'addr_city', type: 'STRING' },
    { name: 'addr_region', type: 'STRING' },
    { name: 'addr_country', type: 'STRING' },
    { name: 'addr_postal', type: 'STRING' },
    { name: 'signup_source', type: 'STRING' },
    { name: 'marketing_opt_in', type: 'BOOL' },
  ];

  assert('AC-10', '12 Avro fields present',
    Object.keys(ddl.columns).length === 13,  // 12 fields + signup_date
    `Expected 13 columns (12 + partition), got ${Object.keys(ddl.columns).length}`);

  for (const f of expectedFields) {
    assertColType('AC-10', `${f.name} is ${f.type}`, ddl.columns, f.name, f.type);
  }
}

// ─── AC-11: fraud_signals — signal_ts TIMESTAMP, reason_codes, score
function testAC11() {
  console.log('\nAC-11: fraud_signals');
  const ddl = parseDDL('fraud_signals');

  assertColType('AC-11', 'signal_ts is TIMESTAMP', ddl.columns, 'signal_ts', 'TIMESTAMP');
  assertColType('AC-11', 'reason_codes is ARRAY<STRING>', ddl.columns, 'reason_codes', 'ARRAY<STRING>');
  assertColType('AC-11', 'score is FLOAT64', ddl.columns, 'score', 'FLOAT64');
}

// ─── AC-12: Views parse successfully ──────────────────────────────
function testAC12() {
  console.log('\nAC-12: Views');
  const omniture = parseView('omniture');
  assert('AC-12', 'omniture view DDL exists', omniture.raw.length > 0, 'Empty file');
  assertIncludes('AC-12', 'omniture references omniture_logs', omniture.sql, 'omniture_logs');
  assertIncludes('AC-12', 'omniture references partition_ts', omniture.sql, 'partition_ts');
  assertNotIncludes('AC-12', 'omniture SQL body does not reference date_ts', omniture.sql, 'date_ts');
  assertIncludes('AC-12', 'omniture selects col_2 AS event_ts', omniture.sql, 'col_2');
  assertIncludes('AC-12', 'omniture selects col_8 AS ip', omniture.sql, 'col_8');

  const fraud = parseView('v_fraud_signals_recent');
  assert('AC-12', 'v_fraud_signals_recent DDL exists', fraud.raw.length > 0, 'Empty file');
  assertIncludes('AC-12', 'v_fraud_signals_recent references fraud_signals', fraud.sql, 'fraud_signals');
  assertIncludes('AC-12', 'v_fraud_signals_recent uses FORMAT_DATE', fraud.sql, 'FORMAT_DATE');
  assertIncludes('AC-12', 'v_fraud_signals_recent uses DATE_SUB', fraud.sql, 'DATE_SUB');
  assertIncludes('AC-12', 'v_fraud_signals_recent uses CURRENT_DATE', fraud.sql, 'CURRENT_DATE');
  assertIncludes('AC-12', 'v_fraud_signals_recent filters on signal_date', fraud.sql, 'signal_date');
}

// ─── AC-14: All 12 date_ts tables have partition_ts TIMESTAMP HOUR
function testAC14() {
  console.log('\nAC-14: All 12 date_ts tables → partition_ts TIMESTAMP at HOUR granularity');
  const dateTsTables = [
    'sales_retail', 'omniture_logs', 'pos_transactions', 'loyalty_events',
    'email_campaign_clicks', 'return_authorizations', 'delivery_routes',
    'driver_logs', 'customer_complaints', 'chat_transcripts',
    'shipment_tracking', 'warehouse_picks'
  ];

  for (const tableName of dateTsTables) {
    const ddl = parseDDL(tableName);
    assertHasCol('AC-14', `${tableName}: partition_ts present`, ddl.columns, 'partition_ts');
    assertColType('AC-14', `${tableName}: partition_ts is TIMESTAMP`, ddl.columns, 'partition_ts', 'TIMESTAMP');
    assertEq('AC-14', `${tableName}: partition by TIMESTAMP_TRUNC(partition_ts, HOUR)`,
      ddl.partitionExpr, 'TIMESTAMP_TRUNC(partition_ts, HOUR)');
  }
}

// ─── Run all tests ─────────────────────────────────────────────────
function main() {
  console.log('Acceptance Criteria Assertion Suite');
  console.log('===================================');

  testAC1();
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
  testAC12();
  testAC14();

  // ─ Summary ──────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('AC ASSERTION SUITE SUMMARY');
  console.log(`${'='.repeat(60)}`);

  // Group by AC
  const acGroups = {};
  for (const r of results) {
    if (!acGroups[r.ac]) acGroups[r.ac] = { pass: 0, fail: 0, failures: [] };
    if (r.status === 'PASS') acGroups[r.ac].pass++;
    else {
      acGroups[r.ac].fail++;
      acGroups[r.ac].failures.push(`${r.desc}: ${r.detail}`);
    }
  }

  for (const [ac, g] of Object.entries(acGroups)) {
    const status = g.fail === 0 ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}  ${ac} (${g.pass + g.fail} checks, ${g.pass} passed, ${g.fail} failed)`);
    for (const f of g.failures) {
      console.log(`         → ${f}`);
    }
  }

  console.log(`\nTotal assertions: ${totalTests}`);
  console.log(`Passed:           ${passedTests}`);
  console.log(`Failed:           ${failedTests}`);
  console.log(`\nRESULT: ${failedTests === 0 ? 'PASS' : 'FAIL'}`);
  process.exit(failedTests > 0 ? 1 : 0);
}

main();
