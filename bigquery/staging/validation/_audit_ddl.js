#!/usr/bin/env node
// Audit script: systematically compare Hive HQL source against BigQuery DDLs
// Checks type mappings, column presence, partition/cluster transforms, and naming

const fs = require('fs');
const path = require('path');

// ── Parse Hive HQL ──────────────────────────────────────────────────────
const hqlPath = '/workspace/source/clusters/acme-lake/hive/06-staging-tables.hql';
const hql = fs.readFileSync(hqlPath, 'utf8');

// Type mapping rules
const TYPE_MAP = {
  'STRING': 'STRING',
  'INT': 'INT64',
  'BIGINT': 'INT64',
  'DOUBLE': 'FLOAT64',
  'BOOLEAN': 'BOOL',
  'TIMESTAMP': 'TIMESTAMP',
  'DATE': 'DATE',
};

function mapType(hiveType) {
  const upper = hiveType.trim().toUpperCase();
  if (upper.startsWith('DECIMAL')) return 'NUMERIC';
  if (upper.startsWith('MAP<')) return 'JSON';
  if (upper.startsWith('ARRAY<STRING>')) return 'ARRAY<STRING>';
  return TYPE_MAP[upper] || `UNKNOWN(${hiveType})`;
}

// ── Parse Hive tables from HQL ──────────────────────────────────────────
function parseHiveTables(hql) {
  const tables = {};
  const tableRegex = /CREATE\s+TABLE\s+staging\.(\w+)\s*\(([\s\S]*?)\)\s*PARTITIONED\s+BY\s*\(([^)]+)\)([\s\S]*?)(?=(?:DROP\s+TABLE|CREATE\s+(?:TABLE|VIEW)|$))/gi;
  let match;
  while ((match = tableRegex.exec(hql)) !== null) {
    const name = match[1];
    const colBlock = match[2];
    const partBlock = match[3];
    const afterPart = match[4];

    const cols = [];
    for (const line of colBlock.split('\n')) {
      const trimmed = line.replace(/--.*$/, '').trim().replace(/,\s*$/, '');
      if (!trimmed) continue;
      const colMatch = trimmed.match(/^(\w+)\s+(.+)$/);
      if (colMatch) {
        cols.push({ name: colMatch[1], type: colMatch[2].trim() });
      }
    }

    const partCols = [];
    for (const part of partBlock.split(',')) {
      const trimmed = part.trim();
      const pMatch = trimmed.match(/^(\w+)\s+(\w+)$/);
      if (pMatch) {
        partCols.push({ name: pMatch[1], type: pMatch[2] });
      }
    }

    let clusteredBy = null;
    let buckets = null;
    const clusterMatch = afterPart.match(/CLUSTERED\s+BY\s*\(([^)]+)\)\s*INTO\s+(\d+)\s+BUCKETS/i);
    if (clusterMatch) {
      clusteredBy = clusterMatch[1].split(',').map(s => s.trim());
      buckets = parseInt(clusterMatch[2]);
    }

    tables[name] = { cols, partCols, clusteredBy, buckets };
  }
  return tables;
}

// ── Parse BigQuery DDL (robust) ─────────────────────────────────────────
function parseBqDdl(sql) {
  // Strip SQL comments
  const stripped = sql.replace(/--[^\n]*/g, '');

  // Extract table name from the backtick-quoted identifier
  const nameMatch = stripped.match(/CREATE\s+OR\s+REPLACE\s+TABLE\s+`([^`]+)`/i);
  const fullRef = nameMatch ? nameMatch[1] : '';
  const parts = fullRef.split('.');
  const projectId = parts[0] || 'UNKNOWN';
  const dataset = parts[1] || '';
  const tableName = parts[2] || '';

  // Extract columns from within the parentheses of CREATE TABLE `...` ( ... )
  // Find the opening paren after the table name and match to closing paren
  const createIdx = stripped.indexOf('(', stripped.indexOf(fullRef));
  if (createIdx === -1) {
    return { tableName, cols: [], partitionBy: null, clusterBy: null, hiveRemnants: [], projectId };
  }

  // Find matching closing paren
  let depth = 0;
  let closeIdx = -1;
  for (let i = createIdx; i < stripped.length; i++) {
    if (stripped[i] === '(') depth++;
    if (stripped[i] === ')') {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }

  const colBlock = stripped.substring(createIdx + 1, closeIdx);
  const cols = [];

  // Parse columns — handle nested types like ARRAY<STRING>
  // Split by comma at depth 0 (not inside < >)
  const colEntries = [];
  let current = '';
  let angleDepth = 0;
  for (const ch of colBlock) {
    if (ch === '<') angleDepth++;
    if (ch === '>') angleDepth--;
    if (ch === ',' && angleDepth === 0) {
      colEntries.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) colEntries.push(current.trim());

  for (const entry of colEntries) {
    const trimmed = entry.replace(/\n/g, ' ').trim();
    if (!trimmed) continue;
    const colMatch = trimmed.match(/^(\w+)\s+(.+)$/);
    if (colMatch) {
      cols.push({ name: colMatch[1], type: colMatch[2].trim() });
    }
  }

  // Extract PARTITION BY (after the closing paren)
  const afterCols = stripped.substring(closeIdx + 1);
  const partMatch = afterCols.match(/PARTITION\s+BY\s+(\w+)/i);
  const partitionBy = partMatch ? partMatch[1] : null;

  // Extract CLUSTER BY
  const clusterMatch = afterCols.match(/CLUSTER\s+BY\s+([^;]+)/i);
  let clusterBy = null;
  if (clusterMatch) {
    clusterBy = clusterMatch[1].split(',').map(s => s.trim().replace(/;$/, ''));
  }

  // Check for Hive remnants in the original (uncommented) SQL
  const hiveRemnants = [];
  if (/STORED\s+AS/i.test(stripped)) hiveRemnants.push('STORED AS');
  if (/INTO\s+\d+\s+BUCKETS/i.test(stripped)) hiveRemnants.push('BUCKETS');
  if (/TBLPROPERTIES/i.test(stripped)) hiveRemnants.push('TBLPROPERTIES');
  // Only flag CLUSTERED BY that's in actual SQL, not comments
  if (/CLUSTERED\s+BY/i.test(stripped)) hiveRemnants.push('CLUSTERED BY (Hive-style)');

  return { tableName, cols, partitionBy, clusterBy, hiveRemnants, projectId };
}

// ── Partition/Cluster transformation rules ──────────────────────────────
const GROUP1 = ['cleansed_orders', 'cleansed_customers', 'cleansed_products',
                'geocoded_addresses', 'merged_returns_cdc', 'fraud_scored'];
const GROUP2_EVENT_DATE = ['parsed_loyalty_events', 'normalized_carrier_events'];
const GROUP2_SNAPSHOT_DATE = ['warehouse_kpi_snapshot'];
const GROUP3 = ['dedup_clickstream'];

const EXPECTED_PARTITION = {
  cleansed_orders: { partCol: 'order_date', clusterBy: null },
  cleansed_customers: { partCol: 'load_date', clusterBy: null },
  cleansed_products: { partCol: 'load_date', clusterBy: null },
  geocoded_addresses: { partCol: 'load_date', clusterBy: null },
  merged_returns_cdc: { partCol: 'snapshot_date', clusterBy: null },
  fraud_scored: { partCol: 'score_date', clusterBy: null },
  parsed_loyalty_events: { partCol: 'event_date', clusterBy: null },
  normalized_carrier_events: { partCol: 'event_date', clusterBy: null },
  warehouse_kpi_snapshot: { partCol: 'snapshot_date', clusterBy: null },
  dedup_clickstream: { partCol: 'event_date', clusterBy: ['country_partition', 'user_id'] },
};

// ── Run Audit ───────────────────────────────────────────────────────────
const hiveTables = parseHiveTables(hql);
const bqDir = '/workspace/project/bigquery/staging/tables';
const bqFiles = fs.readdirSync(bqDir).filter(f => f.endsWith('.sql'));

let issues = [];
let passed = 0;
let total = 0;

function check(desc, condition, detail) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${desc}`);
  } else {
    issues.push(`${desc}: ${detail || 'FAILED'}`);
    console.log(`  ✗ ${desc} — ${detail || 'FAILED'}`);
  }
}

console.log('=== DDL Audit: Hive Source vs BigQuery Target ===\n');

for (const file of bqFiles) {
  const tableName = file.replace('.sql', '');
  const bqSql = fs.readFileSync(path.join(bqDir, file), 'utf8');
  const bq = parseBqDdl(bqSql);
  const hive = hiveTables[tableName];

  console.log(`\n── ${tableName} ──`);

  if (!hive) {
    check(`Hive source exists for ${tableName}`, false, 'No Hive CREATE TABLE found');
    continue;
  }

  // (a) Project ID
  check('Project ID is acme-analytics', bq.projectId === 'acme-analytics', `Got: ${bq.projectId}`);

  // (c) No Hive remnants (in actual SQL, not comments)
  check('No Hive remnants in SQL', bq.hiveRemnants.length === 0, `Found: ${bq.hiveRemnants.join(', ')}`);

  // Build expected BQ columns from Hive
  const expectedCols = [];
  for (const col of hive.cols) {
    expectedCols.push({ name: col.name, type: mapType(col.type) });
  }

  const exp = EXPECTED_PARTITION[tableName];
  if (GROUP1.includes(tableName)) {
    for (const pcol of hive.partCols) {
      expectedCols.push({ name: pcol.name, type: mapType(pcol.type) });
    }
  } else if (GROUP2_EVENT_DATE.includes(tableName)) {
    expectedCols.push({ name: 'event_date', type: 'DATE' });
  } else if (GROUP2_SNAPSHOT_DATE.includes(tableName)) {
    expectedCols.push({ name: 'snapshot_date', type: 'DATE' });
  } else if (GROUP3.includes(tableName)) {
    expectedCols.push({ name: 'country_partition', type: 'STRING' });
    expectedCols.push({ name: 'event_date', type: 'DATE' });
  }

  // Compare columns
  const bqColMap = {};
  for (const col of bq.cols) {
    bqColMap[col.name] = col.type;
  }
  const expectedColMap = {};
  for (const col of expectedCols) {
    expectedColMap[col.name] = col.type;
  }

  // Check all expected columns exist with correct types
  for (const col of expectedCols) {
    const bqType = bqColMap[col.name];
    check(
      `Column ${col.name}: ${col.type}`,
      bqType === col.type,
      bqType ? `Got: ${bqType}` : 'MISSING from BQ DDL'
    );
  }

  // Check no unexpected columns
  for (const col of bq.cols) {
    if (!expectedColMap[col.name]) {
      check(`No unexpected column ${col.name}`, false, `Extra column in BQ DDL: ${col.name} ${col.type}`);
    }
  }

  // Check date_ts is NOT in BQ DDL (for Groups 2 & 3)
  if (!GROUP1.includes(tableName)) {
    check('date_ts absent from BQ DDL', !bqColMap['date_ts'], 'date_ts found in BQ DDL');
  }

  // Partition
  check(
    `Partition by ${exp.partCol}`,
    bq.partitionBy === exp.partCol,
    `Got: ${bq.partitionBy}`
  );

  // Cluster
  if (exp.clusterBy) {
    check(
      `Cluster by ${exp.clusterBy.join(', ')}`,
      bq.clusterBy && JSON.stringify(bq.clusterBy) === JSON.stringify(exp.clusterBy),
      `Got: ${bq.clusterBy ? bq.clusterBy.join(', ') : 'none'}`
    );
  } else {
    check(
      'No CLUSTER BY (expected)',
      !bq.clusterBy,
      `Got: ${bq.clusterBy ? bq.clusterBy.join(', ') : 'none'}`
    );
  }

  // Column count
  check(
    `Column count matches (expected ${expectedCols.length})`,
    bq.cols.length === expectedCols.length,
    `Got: ${bq.cols.length}`
  );
}

// ── Audit view ──────────────────────────────────────────────────────────
console.log('\n── v_returns_pending (VIEW) ──');
const viewSql = fs.readFileSync('/workspace/project/bigquery/staging/views/v_returns_pending.sql', 'utf8');

check('Uses CREATE OR REPLACE VIEW', /CREATE\s+OR\s+REPLACE\s+VIEW/i.test(viewSql), '');
check('View project ID is acme-analytics', /`acme-analytics\.staging\.v_returns_pending`/.test(viewSql), '');
check(
  'References acme-analytics.raw.return_authorizations',
  /`acme-analytics\.raw\.return_authorizations`/.test(viewSql),
  ''
);
check('Uses DATE_DIFF (BQ function)', /DATE_DIFF\s*\(/i.test(viewSql), '');
check('Uses DATE() (BQ function)', /DATE\s*\(\s*r\.requested_at\s*\)/i.test(viewSql), '');
check('Uses CURRENT_DATE()', /CURRENT_DATE\s*\(\s*\)/i.test(viewSql), '');
check('No Hive DATEDIFF remnant', !/\bDATEDIFF\s*\(/.test(viewSql), 'Found Hive DATEDIFF');
check('No Hive to_date remnant', !/\bto_date\s*\(/i.test(viewSql), 'Found Hive to_date');

// View columns match source
const viewCols = ['rma_id', 'customer_id', 'invoice_no', 'stock_code', 'quantity', 'requested_at', 'days_pending'];
for (const col of viewCols) {
  check(`View selects ${col}`, new RegExp(`\\b${col}\\b`, 'i').test(viewSql), '');
}
check('WHERE clause references approved', /r\.approved\s+IS\s+NULL\s+OR\s+r\.approved\s*=\s*FALSE/i.test(viewSql), '');

// Verify view columns match raw.return_authorizations columns
const rawDdl = fs.readFileSync('/workspace/project/bigquery/raw/tables/return_authorizations.sql', 'utf8');
for (const col of ['rma_id', 'customer_id', 'invoice_no', 'stock_code', 'quantity', 'requested_at', 'approved']) {
  check(
    `View column ${col} exists in raw.return_authorizations`,
    new RegExp(`\\b${col}\\b`, 'i').test(rawDdl),
    `Column ${col} NOT found in raw DDL`
  );
}

// ── Consolidated file audit ─────────────────────────────────────────────
console.log('\n── all_tables.sql (consolidated) ──');
const allSql = fs.readFileSync('/workspace/project/bigquery/staging/all_tables.sql', 'utf8');

for (const file of bqFiles) {
  const tableName = file.replace('.sql', '');
  check(
    `all_tables.sql contains ${tableName}`,
    allSql.includes(`acme-analytics.staging.${tableName}`),
    'MISSING'
  );
}
check(
  'all_tables.sql contains v_returns_pending',
  allSql.includes('acme-analytics.staging.v_returns_pending'),
  'MISSING'
);

// Compare DDL blocks: extract CREATE from individual files and check they appear in all_tables.sql
for (const file of bqFiles) {
  const individual = fs.readFileSync(path.join(bqDir, file), 'utf8');
  const individualStripped = individual.replace(/--[^\n]*/g, '');
  const individualCreate = individualStripped.match(/(CREATE\s+OR\s+REPLACE\s+TABLE[\s\S]*?;)/i);
  if (individualCreate) {
    const normalized = individualCreate[1].replace(/\s+/g, ' ').trim();
    const allStripped = allSql.replace(/--[^\n]*/g, '');
    const allNormalized = allStripped.replace(/\s+/g, ' ');
    check(
      `all_tables.sql DDL matches ${file}`,
      allNormalized.includes(normalized),
      'CREATE statement differs'
    );
  }
}

const viewFile = fs.readFileSync('/workspace/project/bigquery/staging/views/v_returns_pending.sql', 'utf8');
const viewStripped = viewFile.replace(/--[^\n]*/g, '');
const viewCreate = viewStripped.match(/(CREATE\s+OR\s+REPLACE\s+VIEW[\s\S]*?;)/i);
if (viewCreate) {
  const normalizedView = viewCreate[1].replace(/\s+/g, ' ').trim();
  const allStripped = allSql.replace(/--[^\n]*/g, '');
  const allNormalized = allStripped.replace(/\s+/g, ' ');
  check(
    'all_tables.sql DDL matches v_returns_pending.sql',
    allNormalized.includes(normalizedView),
    'CREATE VIEW statement differs'
  );
}

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\n=== Audit Summary ===`);
console.log(`Passed: ${passed}/${total}`);
console.log(`Failed: ${total - passed}/${total}`);
if (issues.length > 0) {
  console.log('\nISSUES FOUND:');
  for (const issue of issues) {
    console.log(`  • ${issue}`);
  }
}
console.log(`\nRESULT: ${issues.length === 0 ? 'PASS ✓' : 'FAIL ✗'}`);
process.exit(issues.length > 0 ? 1 : 0);
