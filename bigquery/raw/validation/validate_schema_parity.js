/**
 * validate_schema_parity.js
 *
 * Reads source Hive schemas from the HQL files and Avro .avsc schemas,
 * reads target BigQuery schemas from the generated DDL files,
 * compares column-by-column applying the type mapping rules,
 * validates dropped/synthetic partition columns and partition/cluster intent.
 */

const { readFileSync } = require('fs');
const { join } = require('path');

// ─── Paths ─────────────────────────────────────────────────────────
const HIVE_DIR  = '/workspace/source/clusters/acme-lake/hive';
const AVRO_DIR  = '/workspace/source/clusters/acme-lake/schemas';
const BQ_DIR    = '/workspace/project/bigquery/raw/tables';

// ─── Hive → BigQuery type mapping ──────────────────────────────────
const TYPE_MAP = {
  'STRING':   'STRING',
  'INT':      'INT64',
  'BIGINT':   'INT64',
  'TINYINT':  'INT64',
  'BOOLEAN':  'BOOL',
  'DOUBLE':   'FLOAT64',
  'FLOAT':    'FLOAT64',
  'DATE':     'DATE',
  'TIMESTAMP':'TIMESTAMP',
};

function mapHiveType(hiveType) {
  const upper = hiveType.toUpperCase().trim();
  // DECIMAL(p,s) → NUMERIC
  if (/^DECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)$/i.test(upper)) return 'NUMERIC';
  // MAP<STRING,STRING> → JSON
  if (/^MAP\s*</.test(upper)) return 'JSON';
  // STRUCT<...> → recursively map inner fields
  if (/^STRUCT\s*</.test(upper)) return mapStructType(hiveType);
  // ARRAY<...> → recursively map inner type
  if (/^ARRAY\s*</.test(upper)) return mapArrayType(hiveType);
  // Simple scalar
  if (TYPE_MAP[upper]) return TYPE_MAP[upper];
  return `UNMAPPED(${hiveType})`;
}

function mapStructType(hiveType) {
  const inner = extractAngleBracketContent(hiveType);
  const fields = splitTopLevel(inner, ',');
  const mapped = fields.map(f => {
    f = f.trim();
    const colonIdx = f.indexOf(':');
    if (colonIdx < 0) return f;
    const name = f.substring(0, colonIdx).trim();
    const type = f.substring(colonIdx + 1).trim();
    return `${name} ${mapHiveType(type)}`;
  });
  return `STRUCT<${mapped.join(', ')}>`;
}

function mapArrayType(hiveType) {
  const inner = extractAngleBracketContent(hiveType);
  return `ARRAY<${mapHiveType(inner)}>`;
}

function extractAngleBracketContent(s) {
  const start = s.indexOf('<');
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '<') depth++;
    if (s[i] === '>') depth--;
    if (depth === 0) return s.substring(start + 1, i);
  }
  return s.substring(start + 1);
}

/** Split a string by a delimiter, respecting <> () nesting */
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

// ─── Parse Hive CREATE TABLE from HQL ──────────────────────────────
function parseHiveTablesFromHQL(hqlContent) {
  const tables = {};

  // Remove all -- comments from each line (but preserve the structure)
  const lines = hqlContent.split('\n');
  const cleanedLines = lines.map(l => l.replace(/--.*$/, ''));
  const cleaned = cleanedLines.join('\n');

  // Match CREATE EXTERNAL TABLE raw.table_name (...) PARTITIONED BY (...)
  const regex = /CREATE\s+EXTERNAL\s+TABLE\s+raw\.(\w+)\s*\(([\s\S]*?)\)\s*\nPARTITIONED\s+BY\s*\(([^)]*)\)/gi;
  let match;
  while ((match = regex.exec(cleaned)) !== null) {
    const tableName = match[1];
    const colBlock = match[2];
    const partBlock = match[3];

    const columns = parseHiveColumnBlock(colBlock);
    const partitions = parseHivePartitionCols(partBlock);

    tables[tableName] = { columns, partitions };
  }
  return tables;
}

/**
 * Parse a Hive column block handling:
 * - one column per line (normal case)
 * - multiple columns per line (omniture_logs: col_1 STRING, col_2 STRING, ...)
 * - multi-line STRUCT/ARRAY definitions
 */
function parseHiveColumnBlock(colBlock) {
  const cols = [];
  // First, join the block into a single string and split by top-level commas
  const entries = splitTopLevel(colBlock, ',');

  for (let entry of entries) {
    entry = entry.trim();
    if (!entry) continue;
    // Each entry should be: name type
    const firstSpace = entry.indexOf(' ');
    if (firstSpace < 0) continue;
    let name = entry.substring(0, firstSpace).trim().toLowerCase();
    let type = entry.substring(firstSpace + 1).trim();

    // Clean up any newlines/whitespace inside type
    type = type.replace(/\s+/g, ' ').trim();

    // Skip keyword lines
    if (['create', 'external', 'table', 'partitioned', 'row', 'stored', 'drop'].includes(name)) continue;

    cols.push({ name, type });
  }
  return cols;
}

function parseHivePartitionCols(partBlock) {
  const cols = [];
  const parts = splitTopLevel(partBlock, ',');
  for (let part of parts) {
    part = part.trim();
    if (!part) continue;
    const tokens = part.split(/\s+/);
    if (tokens.length >= 2) {
      cols.push({ name: tokens[0].toLowerCase(), type: tokens[1].toUpperCase() });
    }
  }
  return cols;
}

// ─── Parse Avro-backed tables ──────────────────────────────────────
function parseAvroSchema(avscPath, hivePartitions) {
  const schema = JSON.parse(readFileSync(avscPath, 'utf-8'));
  const columns = [];
  for (const field of schema.fields) {
    columns.push({ name: field.name, type: avroFieldToHiveType(field) });
  }
  return { columns, partitions: hivePartitions };
}

function avroFieldToHiveType(field) {
  const type = field.type;
  if (Array.isArray(type)) {
    const nonNull = type.filter(t => t !== 'null');
    if (nonNull.length === 1) {
      return avroTypeToHive(nonNull[0]);
    }
  }
  return avroTypeToHive(type);
}

function avroTypeToHive(t) {
  if (typeof t === 'string') {
    const map = { 'string': 'STRING', 'boolean': 'BOOLEAN', 'int': 'INT', 'long': 'BIGINT', 'double': 'DOUBLE', 'float': 'FLOAT' };
    return map[t] || t.toUpperCase();
  }
  if (typeof t === 'object') {
    if (t.logicalType === 'timestamp-millis') return 'TIMESTAMP';
    if (t.type === 'array') return `ARRAY<${avroTypeToHive(t.items)}>`;
  }
  return 'STRING';
}

// ─── Parse BigQuery DDL ─────────────────────────────────────────────
function parseBQDDL(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const result = { columns: [], partitionExpr: null, clusterBy: null };

  // Strip comments
  const stripped = content.replace(/--.*$/gm, '').trim();

  // Extract columns between first ( and matching )
  const createIdx = stripped.search(/CREATE\s+OR\s+REPLACE\s+TABLE/i);
  if (createIdx < 0) return result;
  const openParen = stripped.indexOf('(', createIdx);
  if (openParen < 0) return result;

  // Find matching close paren
  let depth = 0;
  let closeParen = -1;
  for (let i = openParen; i < stripped.length; i++) {
    if (stripped[i] === '(') depth++;
    if (stripped[i] === ')') depth--;
    if (depth === 0) { closeParen = i; break; }
  }
  if (closeParen < 0) return result;

  const colBlock = stripped.substring(openParen + 1, closeParen);
  result.columns = parseBQColumns(colBlock);

  // Everything after the closing paren
  const afterCols = stripped.substring(closeParen + 1).trim();

  // Extract PARTITION BY — take the rest of the line up to newline or CLUSTER or ;
  const partMatch = afterCols.match(/PARTITION\s+BY\s+(.+?)(?:\s*(?:CLUSTER|;|$))/si);
  if (partMatch) {
    result.partitionExpr = partMatch[1].trim().replace(/;$/, '').replace(/\n.*$/s, '').trim();
  }

  // Extract CLUSTER BY — take until ; or end
  const clusterMatch = afterCols.match(/CLUSTER\s+BY\s+(\w+)/i);
  if (clusterMatch) {
    result.clusterBy = clusterMatch[1].trim();
  }

  return result;
}

function parseBQColumns(colBlock) {
  const entries = splitTopLevel(colBlock, ',');
  const cols = [];
  for (let entry of entries) {
    entry = entry.replace(/--.*$/gm, '').trim();
    if (!entry) continue;
    // Collapse whitespace
    entry = entry.replace(/\s+/g, ' ').trim();
    const firstSpace = entry.indexOf(' ');
    if (firstSpace < 0) continue;
    const name = entry.substring(0, firstSpace).trim().toLowerCase();
    const type = entry.substring(firstSpace + 1).trim();
    if (['create', 'or', 'replace', 'table', 'partition', 'cluster'].includes(name)) continue;
    cols.push({ name, type });
  }
  return cols;
}

// ─── Table-specific config ─────────────────────────────────────────
const TABLE_CONFIG = {
  // Group 1: date_ts → partition_ts TIMESTAMP
  sales_retail:          { droppedParts: ['date_ts'], syntheticCols: [{name:'partition_ts', type:'TIMESTAMP'}], partition: 'TIMESTAMP_TRUNC(partition_ts, HOUR)', cluster: null },
  omniture_logs:         { droppedParts: ['date_ts'], syntheticCols: [{name:'partition_ts', type:'TIMESTAMP'}], partition: 'TIMESTAMP_TRUNC(partition_ts, HOUR)', cluster: null },
  pos_transactions:      { droppedParts: ['date_ts'], syntheticCols: [{name:'partition_ts', type:'TIMESTAMP'}], partition: 'TIMESTAMP_TRUNC(partition_ts, HOUR)', cluster: null },
  loyalty_events:        { droppedParts: ['date_ts'], syntheticCols: [{name:'partition_ts', type:'TIMESTAMP'}], partition: 'TIMESTAMP_TRUNC(partition_ts, HOUR)', cluster: null },
  email_campaign_clicks: { droppedParts: ['date_ts'], syntheticCols: [{name:'partition_ts', type:'TIMESTAMP'}], partition: 'TIMESTAMP_TRUNC(partition_ts, HOUR)', cluster: null },
  return_authorizations: { droppedParts: ['date_ts'], syntheticCols: [{name:'partition_ts', type:'TIMESTAMP'}], partition: 'TIMESTAMP_TRUNC(partition_ts, HOUR)', cluster: null },
  delivery_routes:       { droppedParts: ['date_ts'], syntheticCols: [{name:'partition_ts', type:'TIMESTAMP'}], partition: 'TIMESTAMP_TRUNC(partition_ts, HOUR)', cluster: null },
  driver_logs:           { droppedParts: ['date_ts'], syntheticCols: [{name:'partition_ts', type:'TIMESTAMP'}], partition: 'TIMESTAMP_TRUNC(partition_ts, HOUR)', cluster: null },
  customer_complaints:   { droppedParts: ['date_ts'], syntheticCols: [{name:'partition_ts', type:'TIMESTAMP'}], partition: 'TIMESTAMP_TRUNC(partition_ts, HOUR)', cluster: null },
  chat_transcripts:      { droppedParts: ['date_ts'], syntheticCols: [{name:'partition_ts', type:'TIMESTAMP'}], partition: 'TIMESTAMP_TRUNC(partition_ts, HOUR)', cluster: null },
  shipment_tracking:     { droppedParts: ['date_ts', 'carrier_partition'], syntheticCols: [{name:'partition_ts', type:'TIMESTAMP'}, {name:'carrier_partition', type:'STRING'}], partition: 'TIMESTAMP_TRUNC(partition_ts, HOUR)', cluster: 'carrier_partition' },
  warehouse_picks:       { droppedParts: ['date_ts', 'warehouse_id_partition'], syntheticCols: [{name:'partition_ts', type:'TIMESTAMP'}, {name:'warehouse_id_partition', type:'STRING'}], partition: 'TIMESTAMP_TRUNC(partition_ts, HOUR)', cluster: 'warehouse_id_partition' },
  // Group 2-6
  inventory_movements:   { droppedParts: ['year', 'month', 'day'], syntheticCols: [{name:'movement_date', type:'DATE'}], partition: 'movement_date', cluster: null },
  supplier_invoices:     { droppedParts: ['feed_year', 'feed_month'], syntheticCols: [{name:'feed_date', type:'DATE'}], partition: 'DATE_TRUNC(feed_date, MONTH)', cluster: null },
  product_catalog_feed:  { droppedParts: [], syntheticCols: [], partition: 'feed_date', cluster: null, partTypeChange: {feed_date: {from:'STRING', to:'DATE'}} },
  mobile_events:         { droppedParts: ['event_date', 'hour_bucket'], syntheticCols: [{name:'event_timestamp', type:'TIMESTAMP'}], partition: 'TIMESTAMP_TRUNC(event_timestamp, HOUR)', cluster: 'platform' },
  returns_cdc:           { droppedParts: [], syntheticCols: [], partition: 'snapshot_date', cluster: null },
  // Group 7: Avro
  customer_signups:      { droppedParts: [], syntheticCols: [], partition: 'signup_date', cluster: null, partTypeChange: {signup_date: {from:'STRING', to:'DATE'}} },
  fraud_signals:         { droppedParts: [], syntheticCols: [{name:'signal_date', type:'STRING'}], partition: 'TIMESTAMP_TRUNC(signal_ts, DAY)', cluster: null },
};

// ─── Main ──────────────────────────────────────────────────────────
function main() {
  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;
  const failures = [];

  function check(table, desc, passed, detail) {
    totalChecks++;
    if (passed) {
      passedChecks++;
      console.log(`  ✓ ${desc}`);
    } else {
      failedChecks++;
      failures.push({ table, desc, detail });
      console.log(`  ✗ ${desc}: ${detail}`);
    }
  }

  // ─ Load all Hive schemas ─────────────────────────────────────────
  const hiveFiles = ['02-raw-external-tables.hql', '05-additional-raw-feeds.hql', '07-json-raw.hql'];
  let allHiveTables = {};
  for (const f of hiveFiles) {
    const content = readFileSync(join(HIVE_DIR, f), 'utf-8');
    Object.assign(allHiveTables, parseHiveTablesFromHQL(content));
  }

  // Add Avro-backed tables
  allHiveTables['customer_signups'] = parseAvroSchema(
    join(AVRO_DIR, 'customer_signups-v3.avsc'),
    [{ name: 'signup_date', type: 'STRING' }]
  );
  allHiveTables['fraud_signals'] = parseAvroSchema(
    join(AVRO_DIR, 'fraud_signals-v5.avsc'),
    [{ name: 'signal_date', type: 'STRING' }]
  );

  // ─ Validate each table ───────────────────────────────────────────
  for (const [tableName, config] of Object.entries(TABLE_CONFIG)) {
    console.log(`\nTABLE: raw.${tableName}`);

    const hive = allHiveTables[tableName];
    if (!hive) {
      check(tableName, 'Source schema found', false, 'No Hive schema parsed');
      continue;
    }

    const bqFilePath = join(BQ_DIR, `${tableName}.sql`);
    let bq;
    try {
      bq = parseBQDDL(bqFilePath);
    } catch (e) {
      check(tableName, 'BQ DDL parseable', false, e.message);
      continue;
    }

    const bqColMap = {};
    for (const col of bq.columns) {
      bqColMap[col.name] = col.type;
    }

    // 1. Check all source data columns are present with correct mapped type
    for (const col of hive.columns) {
      const expectedBQ = mapHiveType(col.type);
      const actualBQ = bqColMap[col.name];
      if (!actualBQ) {
        check(tableName, `Column ${col.name} present`, false, `Missing in BQ DDL (expected ${expectedBQ})`);
      } else {
        const normalA = actualBQ.replace(/\s+/g, ' ').toUpperCase();
        const normalE = expectedBQ.replace(/\s+/g, ' ').toUpperCase();
        check(tableName, `Column ${col.name} type → ${normalA}`,
          normalA === normalE,
          normalA === normalE ? '' : `Expected ${normalE}, got ${normalA}`);
      }
    }

    // 2. Check dropped partition columns are absent (or promoted to regular col)
    for (const dropped of config.droppedParts) {
      const present = bq.columns.some(c => c.name === dropped);
      const isPromoted = config.syntheticCols.some(s => s.name === dropped);
      if (isPromoted) {
        check(tableName, `Partition col ${dropped} promoted to regular col`, present,
          present ? '' : `${dropped} should be a regular column but is missing`);
      } else {
        check(tableName, `Dropped partition col ${dropped} absent`, !present,
          !present ? '' : `${dropped} should be dropped but is present`);
      }
    }

    // 3. Check synthetic partition columns are present with correct type
    for (const syn of config.syntheticCols) {
      const actual = bqColMap[syn.name];
      if (!actual) {
        check(tableName, `Synthetic col ${syn.name} present`, false, 'Missing');
      } else {
        check(tableName, `Synthetic col ${syn.name} type → ${actual.toUpperCase()}`,
          actual.toUpperCase() === syn.type.toUpperCase(),
          actual.toUpperCase() === syn.type.toUpperCase() ? '' : `Expected ${syn.type}, got ${actual}`);
      }
    }

    // 4. Check partition type changes (product_catalog_feed.feed_date STRING→DATE, etc.)
    if (config.partTypeChange) {
      for (const [colName, change] of Object.entries(config.partTypeChange)) {
        const actual = bqColMap[colName];
        check(tableName, `Partition col ${colName} type changed to ${change.to}`,
          actual && actual.toUpperCase() === change.to,
          (actual && actual.toUpperCase() === change.to) ? '' : `Expected ${change.to}, got ${actual || 'MISSING'}`);
      }
    }

    // 5. Check partition expression
    check(tableName, `Partition expr = ${config.partition}`,
      bq.partitionExpr === config.partition,
      bq.partitionExpr === config.partition ? '' : `Expected "${config.partition}", got "${bq.partitionExpr}"`);

    // 6. Check cluster expression
    if (config.cluster) {
      check(tableName, `Cluster by = ${config.cluster}`,
        bq.clusterBy === config.cluster,
        bq.clusterBy === config.cluster ? '' : `Expected "${config.cluster}", got "${bq.clusterBy}"`);
    } else {
      check(tableName, 'No cluster by',
        !bq.clusterBy,
        !bq.clusterBy ? '' : `Expected no CLUSTER BY, got "${bq.clusterBy}"`);
    }

    // 7. Check no unexpected columns
    const expectedNames = new Set([
      ...hive.columns.map(c => c.name),
      ...config.syntheticCols.map(s => s.name),
    ]);
    // Partition cols that were type-changed stay
    for (const pc of hive.partitions) {
      if (!config.droppedParts.includes(pc.name)) {
        expectedNames.add(pc.name);
      }
    }
    for (const bqCol of bq.columns) {
      if (!expectedNames.has(bqCol.name)) {
        check(tableName, `Column ${bqCol.name} expected`,
          false, `Unexpected column in BQ DDL`);
      }
    }

    // Column count summary
    const expectedCount = expectedNames.size;
    const actualCount = bq.columns.length;
    check(tableName, `Column count: ${actualCount} (expected ${expectedCount})`,
      actualCount === expectedCount,
      actualCount === expectedCount ? '' : `Expected ${expectedCount}, got ${actualCount}`);
  }

  // ─ Summary ───────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SCHEMA PARITY VALIDATION SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Tables validated: ${Object.keys(TABLE_CONFIG).length}`);
  console.log(`Total checks:    ${totalChecks}`);
  console.log(`Passed:          ${passedChecks}`);
  console.log(`Failed:          ${failedChecks}`);

  if (failures.length > 0) {
    console.log(`\nFAILURES:`);
    for (const f of failures) {
      console.log(`  [${f.table}] ${f.desc}: ${f.detail}`);
    }
  }

  console.log(`\nRESULT: ${failedChecks === 0 ? 'PASS' : 'FAIL'}`);
  process.exit(failedChecks > 0 ? 1 : 0);
}

main();
