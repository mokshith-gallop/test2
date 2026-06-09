#!/usr/bin/env node
/**
 * Schema Parity Validation (AC-13)
 *
 * Connects to the LIVE Hive metastore, reads column/type/partition info for
 * each of the 17 raw tables, then compares against the BigQuery DDL files
 * column-by-column.
 *
 * Checks:
 *   1. Every source column is present in the target (except dropped partition cols).
 *   2. No unexpected columns exist in the target (except synthetic partition cols).
 *   3. Each column's type maps correctly per the type-mapping table.
 *   4. Partition/cluster intent is preserved per the partitioning strategy.
 *
 * Run:
 *   set -a; . /workspace/.gallop/db.env; set +a
 *   node bigquery/raw/validation/schema_parity.mjs
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join } from 'path';
const require = createRequire(import.meta.url);
const hiveDriver = require('hive-driver');

const { TCLIService, TCLIService_types } = hiveDriver.thrift;
const TABLES_DIR = '/workspace/project/bigquery/raw/tables';

// ═══════════════════════════════════════════════════════════════════════
// Type mapping: Hive → BigQuery
// ═══════════════════════════════════════════════════════════════════════
const SCALAR_MAP = {
  'string':    'STRING',
  'int':       'INT64',
  'bigint':    'INT64',
  'tinyint':   'INT64',
  'boolean':   'BOOL',
  'double':    'FLOAT64',
  'float':     'FLOAT64',
  'date':      'DATE',
  'timestamp': 'TIMESTAMP',
};

function mapHiveType(hiveType) {
  const t = hiveType.toLowerCase().trim();
  if (t.startsWith('decimal'))  return 'NUMERIC';
  if (t.startsWith('map<'))     return 'JSON';
  if (t.startsWith('struct<'))  return mapStruct(t);
  if (t.startsWith('array<'))   return mapArray(t);
  return SCALAR_MAP[t] || `UNMAPPED(${t})`;
}

function mapStruct(t) {
  const inner = t.slice(7, -1);
  const fields = splitNested(inner);
  const mapped = fields.map(f => {
    const idx = f.indexOf(':');
    return `${f.slice(0, idx).trim()} ${mapHiveType(f.slice(idx + 1).trim())}`;
  });
  return `STRUCT<${mapped.join(', ')}>`;
}

function mapArray(t) {
  const inner = t.slice(6, -1);
  return `ARRAY<${mapHiveType(inner)}>`;
}

/** Split on commas that are NOT inside angle-brackets or parentheses. */
function splitNested(s) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '<' || s[i] === '(') depth++;
    else if (s[i] === '>' || s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      parts.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(s.slice(start).trim());
  return parts;
}

// ═══════════════════════════════════════════════════════════════════════
// Per-table migration rules (partition transforms, cluster, synthetic cols)
// ═══════════════════════════════════════════════════════════════════════

/** Columns that existed as Hive partition columns but are DROPPED in BQ. */
const DROPPED_PARTITION_COLS = {
  // Group 1 — date_ts dropped (12 tables)
  sales_retail:           ['date_ts'],
  omniture_logs:          ['date_ts'],
  pos_transactions:       ['date_ts'],
  loyalty_events:         ['date_ts'],
  email_campaign_clicks:  ['date_ts'],
  return_authorizations:  ['date_ts'],
  delivery_routes:        ['date_ts'],
  driver_logs:            ['date_ts'],
  customer_complaints:    ['date_ts'],
  chat_transcripts:       ['date_ts'],
  shipment_tracking:      ['date_ts'],      // carrier_partition promoted, not dropped
  warehouse_picks:        ['date_ts'],      // warehouse_id_partition promoted, not dropped
  // Group 2
  inventory_movements:    ['year', 'month', 'day'],
  // Group 3
  supplier_invoices:      ['feed_year', 'feed_month'],
  // Group 4 — feed_date STRING → feed_date DATE (name kept, type changes)
  product_catalog_feed:   [],
  // Group 5
  mobile_events:          ['event_date', 'hour_bucket'],
  // Group 6
  returns_cdc:            [],               // snapshot_date kept as-is
  // Group 7
  customer_signups:       [],               // signup_date kept (type changes)
  fraud_signals:          [],               // signal_date kept as regular col
};

/** Partition columns PROMOTED to regular columns in BQ (not dropped). */
const PROMOTED_PARTITION_COLS = {
  shipment_tracking:  ['carrier_partition'],
  warehouse_picks:    ['warehouse_id_partition'],
  fraud_signals:      ['signal_date'],      // kept as STRING regular col
};

/** Synthetic columns ADDED in BQ that don't exist in Hive. */
const SYNTHETIC_COLS = {
  // Group 1
  sales_retail:           [{ name: 'partition_ts', type: 'TIMESTAMP' }],
  omniture_logs:          [{ name: 'partition_ts', type: 'TIMESTAMP' }],
  pos_transactions:       [{ name: 'partition_ts', type: 'TIMESTAMP' }],
  loyalty_events:         [{ name: 'partition_ts', type: 'TIMESTAMP' }],
  email_campaign_clicks:  [{ name: 'partition_ts', type: 'TIMESTAMP' }],
  return_authorizations:  [{ name: 'partition_ts', type: 'TIMESTAMP' }],
  delivery_routes:        [{ name: 'partition_ts', type: 'TIMESTAMP' }],
  driver_logs:            [{ name: 'partition_ts', type: 'TIMESTAMP' }],
  customer_complaints:    [{ name: 'partition_ts', type: 'TIMESTAMP' }],
  chat_transcripts:       [{ name: 'partition_ts', type: 'TIMESTAMP' }],
  shipment_tracking:      [{ name: 'partition_ts', type: 'TIMESTAMP' }],
  warehouse_picks:        [{ name: 'partition_ts', type: 'TIMESTAMP' }],
  // Group 2
  inventory_movements:    [{ name: 'movement_date', type: 'DATE' }],
  // Group 3
  supplier_invoices:      [{ name: 'feed_date', type: 'DATE' }],
  // Group 5
  mobile_events:          [{ name: 'event_timestamp', type: 'TIMESTAMP' }],
  // Groups 4, 6, 7 — no new cols (feed_date, snapshot_date, signup_date are kept)
  product_catalog_feed:   [],
  returns_cdc:            [],
  customer_signups:       [],
  fraud_signals:          [],
};

/** Partition columns where the Hive type differs from BQ type (kept but recast). */
const TYPE_OVERRIDES = {
  product_catalog_feed: { feed_date: 'DATE' },   // STRING → DATE
  customer_signups:     { signup_date: 'DATE' },  // STRING → DATE
};

/** Expected partition expression in the BQ DDL. */
const EXPECTED_PARTITION = {
  sales_retail:           'TIMESTAMP_TRUNC(partition_ts, HOUR)',
  omniture_logs:          'TIMESTAMP_TRUNC(partition_ts, HOUR)',
  pos_transactions:       'TIMESTAMP_TRUNC(partition_ts, HOUR)',
  loyalty_events:         'TIMESTAMP_TRUNC(partition_ts, HOUR)',
  email_campaign_clicks:  'TIMESTAMP_TRUNC(partition_ts, HOUR)',
  return_authorizations:  'TIMESTAMP_TRUNC(partition_ts, HOUR)',
  delivery_routes:        'TIMESTAMP_TRUNC(partition_ts, HOUR)',
  driver_logs:            'TIMESTAMP_TRUNC(partition_ts, HOUR)',
  customer_complaints:    'TIMESTAMP_TRUNC(partition_ts, HOUR)',
  chat_transcripts:       'TIMESTAMP_TRUNC(partition_ts, HOUR)',
  shipment_tracking:      'TIMESTAMP_TRUNC(partition_ts, HOUR)',
  warehouse_picks:        'TIMESTAMP_TRUNC(partition_ts, HOUR)',
  inventory_movements:    'movement_date',
  supplier_invoices:      'DATE_TRUNC(feed_date, MONTH)',
  product_catalog_feed:   'feed_date',
  mobile_events:          'TIMESTAMP_TRUNC(event_timestamp, HOUR)',
  returns_cdc:            'snapshot_date',
  customer_signups:       'signup_date',
  fraud_signals:          'TIMESTAMP_TRUNC(signal_ts, DAY)',
};

/** Expected CLUSTER BY column(s). */
const EXPECTED_CLUSTER = {
  shipment_tracking:  'carrier_partition',
  warehouse_picks:    'warehouse_id_partition',
  mobile_events:      'platform',
};

// ═══════════════════════════════════════════════════════════════════════
// Parse BigQuery DDL files
// ═══════════════════════════════════════════════════════════════════════
function parseBQDDL(ddl) {
  const cols = [];
  const createMatch = ddl.match(/CREATE\s+OR\s+REPLACE\s+TABLE\s+`[^`]+`\s*\(/is);
  if (!createMatch) return { cols: [], partition: null, cluster: null };

  let startIdx = createMatch.index + createMatch[0].length;
  let depth = 1, endIdx = startIdx;
  for (let i = startIdx; i < ddl.length; i++) {
    if (ddl[i] === '(') depth++;
    if (ddl[i] === ')') depth--;
    if (depth === 0) { endIdx = i; break; }
  }

  const colBlock = ddl.slice(startIdx, endIdx);
  for (const frag of splitNested(colBlock)) {
    const trimmed = frag.trim();
    if (!trimmed) continue;
    const sp = trimmed.indexOf(' ');
    if (sp === -1) continue;
    cols.push({
      name: trimmed.slice(0, sp).trim(),
      type: trimmed.slice(sp + 1).trim().replace(/,\s*$/, ''),
    });
  }

  const afterCols = ddl.slice(endIdx + 1).replace(/--.*$/gm, '').trim();
  const pm = afterCols.match(/PARTITION\s+BY\s+(.+?)(?:CLUSTER|;|$)/is);
  const cm = afterCols.match(/CLUSTER\s+BY\s+([^;]+)/i);

  return {
    cols,
    partition: pm ? pm[1].trim().replace(/;$/, '').trim() : null,
    cluster:   cm ? cm[1].trim().replace(/;$/, '').trim() : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Parse Hive DESCRIBE output
// ═══════════════════════════════════════════════════════════════════════
function parseHiveDescribe(rows) {
  const dataCols = [];
  const partCols = [];
  let inPartition = false;

  for (const row of rows) {
    const name = (row.col_name || '').trim();
    const dtype = (row.data_type || '').trim();

    // Section separators
    if (name === '' && !dtype) continue;
    if (name.startsWith('#')) {
      if (name.includes('Partition Information')) { inPartition = true; continue; }
      continue;  // skip header rows
    }
    if (!dtype) continue;

    if (inPartition) {
      partCols.push({ name, type: dtype });
    } else {
      dataCols.push({ name, type: dtype });
    }
  }

  return { dataCols, partCols };
}

// ═══════════════════════════════════════════════════════════════════════
// Hive connection helpers
// ═══════════════════════════════════════════════════════════════════════
const HOST = process.env.HIVE_HOST;
const PORT = parseInt(process.env.HIVE_PORT, 10);
const USER = process.env.HIVE_USER || 'hive';
const PASS = process.env.HIVE_PASSWORD || 'hive';

async function connectHive() {
  const client = new hiveDriver.HiveClient(TCLIService, TCLIService_types);
  const utils  = new hiveDriver.HiveUtils(TCLIService_types);

  await client.connect(
    { host: HOST, port: PORT },
    new hiveDriver.connections.TcpConnection(),
    new hiveDriver.auth.PlainTcpAuthentication({ username: USER, password: PASS })
  );

  const session = await client.openSession({
    client_protocol: TCLIService_types.TProtocolVersion.HIVE_CLI_SERVICE_PROTOCOL_V10
  });

  return { client, session, utils };
}

async function describeTable(session, utils, table) {
  const op = await session.executeStatement(`DESCRIBE raw.${table}`, { runAsync: true });
  await utils.waitUntilReady(op, false, () => {});
  await utils.fetchAll(op);
  const result = utils.getResult(op).getValue();
  await op.close();
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Normalisation helpers
// ═══════════════════════════════════════════════════════════════════════
function norm(s) { return s.replace(/\s+/g, ' ').trim().toUpperCase(); }

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════
const ALL_TABLES = [
  'sales_retail', 'omniture_logs', 'pos_transactions', 'loyalty_events',
  'email_campaign_clicks', 'return_authorizations', 'delivery_routes',
  'driver_logs', 'customer_complaints', 'chat_transcripts',
  'shipment_tracking', 'warehouse_picks',
  'inventory_movements', 'supplier_invoices', 'product_catalog_feed',
  'mobile_events', 'returns_cdc',
  'customer_signups', 'fraud_signals',
];

let totalPass = 0, totalFail = 0;

console.log('Schema Parity Validation (AC-13)');
console.log('================================\n');
console.log(`Connecting to Hive at ${HOST}:${PORT}...`);

const { client, session, utils } = await connectHive();
console.log('Connected to Hive.\n');

for (const tableName of ALL_TABLES) {
  const issues = [];

  // 1. Read Hive schema from live metastore
  const descRows = await describeTable(session, utils, tableName);
  const hive = parseHiveDescribe(descRows);
  // Combine data + partition cols into a single list of "all Hive columns"
  const allHiveCols = [...hive.dataCols, ...hive.partCols];

  // 2. Read BigQuery DDL
  const ddl = readFileSync(join(TABLES_DIR, `${tableName}.sql`), 'utf-8');
  const bq  = parseBQDDL(ddl);
  const bqColMap = new Map(bq.cols.map(c => [c.name, c.type]));

  const dropped    = new Set(DROPPED_PARTITION_COLS[tableName] || []);
  const promoted   = new Set((PROMOTED_PARTITION_COLS[tableName] || []));
  const synthetics = SYNTHETIC_COLS[tableName] || [];
  const overrides  = TYPE_OVERRIDES[tableName] || {};
  const syntheticNames = new Set(synthetics.map(s => s.name));

  // ── Check 1: Every Hive column is present (except dropped) ────────
  for (const col of allHiveCols) {
    if (dropped.has(col.name)) continue;     // intentionally removed
    const bqType = bqColMap.get(col.name);
    if (!bqType) {
      issues.push(`MISSING: Hive column '${col.name}' (${col.type}) not found in BQ DDL`);
      continue;
    }

    // Type check
    const expectedType = overrides[col.name] || mapHiveType(col.type);
    if (norm(bqType) !== norm(expectedType)) {
      issues.push(`TYPE: '${col.name}' — expected ${expectedType}, got ${bqType}`);
    }
  }

  // ── Check 2: No unexpected BQ columns (allow synthetics + promoted) ─
  const hiveNames = new Set(allHiveCols.map(c => c.name));
  for (const bqCol of bq.cols) {
    const n = bqCol.name;
    if (hiveNames.has(n)) continue;          // maps to a Hive column
    if (syntheticNames.has(n)) continue;     // expected synthetic
    // It might be a promoted partition col already counted above
    if (promoted.has(n)) continue;
    issues.push(`UNEXPECTED: BQ column '${n}' (${bqCol.type}) has no Hive source`);
  }

  // ── Check 3: Synthetic columns present with correct type ──────────
  for (const synth of synthetics) {
    const bqType = bqColMap.get(synth.name);
    if (!bqType) {
      issues.push(`MISSING SYNTHETIC: '${synth.name}' (${synth.type}) not in BQ DDL`);
    } else if (norm(bqType) !== norm(synth.type)) {
      issues.push(`SYNTHETIC TYPE: '${synth.name}' — expected ${synth.type}, got ${bqType}`);
    }
  }

  // ── Check 4: Partition clause ─────────────────────────────────────
  const expectedPart = EXPECTED_PARTITION[tableName];
  if (expectedPart) {
    if (!bq.partition || norm(bq.partition) !== norm(expectedPart)) {
      issues.push(`PARTITION: expected '${expectedPart}', got '${bq.partition}'`);
    }
  }

  // ── Check 5: Cluster clause ───────────────────────────────────────
  const expectedCluster = EXPECTED_CLUSTER[tableName];
  if (expectedCluster) {
    if (!bq.cluster || norm(bq.cluster) !== norm(expectedCluster)) {
      issues.push(`CLUSTER: expected '${expectedCluster}', got '${bq.cluster}'`);
    }
  } else if (bq.cluster) {
    issues.push(`CLUSTER: unexpected CLUSTER BY ${bq.cluster}`);
  }

  // ── Check 6: Dropped partition columns are NOT in BQ DDL ──────────
  for (const d of dropped) {
    if (bqColMap.has(d)) {
      issues.push(`NOT DROPPED: Hive partition col '${d}' should be removed but exists in BQ DDL`);
    }
  }

  // ── Report ────────────────────────────────────────────────────────
  const hiveColCount = allHiveCols.length;
  const bqColCount   = bq.cols.length;
  const droppedCount = dropped.size;
  const addedCount   = synthetics.length;

  if (issues.length === 0) {
    console.log(`TABLE: raw.${tableName}`);
    console.log(`  ✓ columns: ${hiveColCount} Hive → ${bqColCount} BQ (dropped ${droppedCount}, added ${addedCount} synthetic)`);
    console.log(`  ✓ types: all ${bqColCount} columns mapped correctly`);
    console.log(`  ✓ partition: ${bq.partition || '(none)'}`);
    if (bq.cluster) console.log(`  ✓ cluster: ${bq.cluster}`);
    console.log(`  RESULT: PASS\n`);
    totalPass++;
  } else {
    console.log(`TABLE: raw.${tableName}`);
    console.log(`  columns: ${hiveColCount} Hive → ${bqColCount} BQ`);
    for (const iss of issues) console.log(`  ✗ ${iss}`);
    console.log(`  RESULT: FAIL\n`);
    totalFail++;
  }
}

await session.close();
await client.close();

// ═══════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════
console.log('═'.repeat(60));
console.log(`SCHEMA PARITY SUMMARY: ${totalPass} passed, ${totalFail} failed out of ${ALL_TABLES.length} tables`);
if (totalFail === 0) {
  console.log('AC-13: ✅ PASS — every source column present with correct type, no columns dropped or added unexpectedly, partition/cluster intent preserved.');
} else {
  console.log('AC-13: ❌ FAIL — see issues above.');
}
process.exit(totalFail > 0 ? 1 : 0);
