/**
 * ac_assertions.js
 *
 * Acceptance Criteria assertion suite for staging DDL (AC-1 through AC-6).
 * Each test function parses the generated DDL file and asserts
 * the exact column types, partition expressions, cluster-by clauses,
 * and view translations.
 */

const { readFileSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');

const TABLES_DIR = '/workspace/project/bigquery/staging/tables';
const VIEWS_DIR  = '/workspace/project/bigquery/staging/views';

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

  // PARTITION BY — capture everything after PARTITION BY up to CLUSTER, ;, or end
  let partitionExpr = null;
  const partMatch = afterCols.match(/PARTITION\s+BY\s+(.+?)(?:\s*(?:CLUSTER|;|$))/si);
  if (partMatch) {
    partitionExpr = partMatch[1].trim().replace(/;$/, '').replace(/\n.*$/s, '').trim();
  }

  // CLUSTER BY — capture full list (e.g., "country_partition, user_id")
  let clusterBy = null;
  const clusterMatch = afterCols.match(/CLUSTER\s+BY\s+([^;]+)/i);
  if (clusterMatch) clusterBy = clusterMatch[1].trim().replace(/;$/, '').trim();

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
    `"${needle}" not found`);
}

function assertNotIncludes(ac, desc, haystack, needle) {
  assert(ac, desc, !haystack || !haystack.includes(needle),
    `"${needle}" should not be present`);
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

// ─── AC-1: All 11 DDL files exist ─────────────────────────────────
function testAC1() {
  console.log('\nAC-1: All 10 table + 1 view DDL files exist');

  const expectedTables = [
    'cleansed_orders', 'cleansed_customers', 'cleansed_products',
    'dedup_clickstream', 'geocoded_addresses', 'parsed_loyalty_events',
    'merged_returns_cdc', 'normalized_carrier_events', 'fraud_scored',
    'warehouse_kpi_snapshot'
  ];

  const tableFiles = readdirSync(TABLES_DIR).filter(f => f.endsWith('.sql'));
  assert('AC-1', `10 table DDL files exist (found ${tableFiles.length})`,
    tableFiles.length === 10,
    `Found ${tableFiles.length} files, expected 10`);

  for (const t of expectedTables) {
    assert('AC-1', `${t}.sql exists`,
      existsSync(join(TABLES_DIR, `${t}.sql`)),
      `${t}.sql not found`);
  }

  const expectedViews = ['v_returns_pending'];
  const viewFiles = readdirSync(VIEWS_DIR).filter(f => f.endsWith('.sql'));
  assert('AC-1', `1 view DDL file exists (found ${viewFiles.length})`,
    viewFiles.length === 1,
    `Found ${viewFiles.length} files, expected 1`);

  for (const v of expectedViews) {
    assert('AC-1', `${v}.sql exists`,
      existsSync(join(VIEWS_DIR, `${v}.sql`)),
      `${v}.sql not found`);
  }
}

// ─── AC-2: dedup_clickstream partition/cluster conversion ──────────
function testAC2() {
  console.log('\nAC-2: dedup_clickstream partition/cluster conversion');
  const ddl = parseDDL('dedup_clickstream');
  const sqlBody = stripComments(ddl.raw);

  // 1. PARTITION BY event_date (single DATE column)
  assertEq('AC-2', 'PARTITION BY event_date',
    ddl.partitionExpr, 'event_date');

  // 2. CLUSTER BY country_partition, user_id
  assertEq('AC-2', 'CLUSTER BY country_partition, user_id',
    ddl.clusterBy, 'country_partition, user_id');

  // 3. No BUCKETS or CLUSTERED BY ... INTO in DDL
  assertNotIncludes('AC-2', 'no BUCKETS keyword in DDL',
    sqlBody.toUpperCase(), 'BUCKETS');
  assertNotIncludes('AC-2', 'no CLUSTERED BY ... INTO in DDL',
    sqlBody.toUpperCase(), 'CLUSTERED BY');

  // 4. event_date column declared as DATE
  assertColType('AC-2', 'event_date is DATE', ddl.columns, 'event_date', 'DATE');

  // 5. country_partition is present as a regular STRING data column
  assertColType('AC-2', 'country_partition is STRING (data column)',
    ddl.columns, 'country_partition', 'STRING');

  // 6. date_ts STRING partition column is absent from DDL
  assertColAbsent('AC-2', 'date_ts absent from DDL', ddl.columns, 'date_ts');
}

// ─── AC-3: Complex type mappings (MAP→JSON, ARRAY→repeated) ───────
function testAC3() {
  console.log('\nAC-3: Complex type mappings');

  // 1. parsed_loyalty_events.meta is JSON
  const loyalty = parseDDL('parsed_loyalty_events');
  assertColType('AC-3', 'parsed_loyalty_events.meta is JSON',
    loyalty.columns, 'meta', 'JSON');

  // 2. fraud_scored.signals is ARRAY<STRING>
  const fraud = parseDDL('fraud_scored');
  assertColType('AC-3', 'fraud_scored.signals is ARRAY<STRING>',
    fraud.columns, 'signals', 'ARRAY<STRING>');

  // 3. parsed_loyalty_events DDL is syntactically valid (has CREATE and PARTITION)
  const loyaltySql = stripComments(loyalty.raw);
  assertIncludes('AC-3', 'parsed_loyalty_events has CREATE OR REPLACE TABLE',
    loyaltySql, 'CREATE OR REPLACE TABLE');
  assertIncludes('AC-3', 'parsed_loyalty_events has PARTITION BY',
    loyaltySql, 'PARTITION BY');

  // 4. fraud_scored DDL is syntactically valid (has CREATE and PARTITION)
  const fraudSql = stripComments(fraud.raw);
  assertIncludes('AC-3', 'fraud_scored has CREATE OR REPLACE TABLE',
    fraudSql, 'CREATE OR REPLACE TABLE');
  assertIncludes('AC-3', 'fraud_scored has PARTITION BY',
    fraudSql, 'PARTITION BY');
}

// ─── AC-6: v_returns_pending cross-dataset + function translation ──
function testAC6() {
  console.log('\nAC-6: v_returns_pending view');
  const view = parseView('v_returns_pending');
  const sqlBody = view.sql;

  // 1. Fully qualified reference to raw.return_authorizations
  assertIncludes('AC-6',
    'references `acme-analytics.raw.return_authorizations`',
    sqlBody, '`acme-analytics.raw.return_authorizations`');

  // 2. Uses DATE_DIFF(CURRENT_DATE(), DATE(r.requested_at), DAY)
  assertIncludes('AC-6',
    'uses DATE_DIFF(CURRENT_DATE(), DATE(r.requested_at), DAY)',
    sqlBody, 'DATE_DIFF(CURRENT_DATE(), DATE(r.requested_at), DAY)');

  // 3. Does NOT contain DATEDIFF( (Hive function)
  assertNotIncludes('AC-6', 'no DATEDIFF( in DDL', sqlBody, 'DATEDIFF(');

  // 4. Does NOT contain to_date( (Hive function)
  assertNotIncludes('AC-6', 'no to_date( in DDL', sqlBody, 'to_date(');

  // 5. Uses CREATE OR REPLACE VIEW
  assertIncludes('AC-6', 'uses CREATE OR REPLACE VIEW',
    sqlBody, 'CREATE OR REPLACE VIEW');
}

// ─── Run all tests ─────────────────────────────────────────────────
function main() {
  console.log('Staging DDL — Acceptance Criteria Assertion Suite');
  console.log('=================================================');

  testAC1();
  testAC2();
  testAC3();
  testAC6();

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
