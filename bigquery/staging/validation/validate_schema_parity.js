/**
 * validate_schema_parity.js
 *
 * Reads source Hive schemas from the staging HQL file (06-staging-tables.hql),
 * reads target BigQuery schemas from the generated DDL files,
 * compares column-by-column applying the type mapping rules,
 * validates dropped/synthetic partition columns and partition/cluster intent.
 *
 * Covers AC-4: every source column present in target with correctly mapped type,
 * no column dropped or added beyond synthetic partition columns.
 */

const { readFileSync } = require('fs');
const { join } = require('path');

// ─── Paths ─────────────────────────────────────────────────────────
const HIVE_HQL  = '/workspace/source/clusters/acme-lake/hive/06-staging-tables.hql';
const BQ_DIR    = '/workspace/project/bigquery/staging/tables';

// ─── Hive → BigQuery type mapping ──────────────────────────────────
const TYPE_MAP = {
  'STRING':    'STRING',
  'INT':       'INT64',
  'BIGINT':    'INT64',
  'TINYINT':   'INT64',
  'BOOLEAN':   'BOOL',
  'DOUBLE':    'FLOAT64',
  'FLOAT':     'FLOAT64',
  'DATE':      'DATE',
  'TIMESTAMP': 'TIMESTAMP',
};

function mapHiveType(hiveType) {
  const upper = hiveType.toUpperCase().trim();
  // DECIMAL(p,s) → NUMERIC
  if (/^DECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)$/i.test(upper)) return 'NUMERIC';
  // MAP<STRING,STRING> → JSON
  if (/^MAP\s*</.test(upper)) return 'JSON';
  // ARRAY<...> → recursively map inner type
  if (/^ARRAY\s*</.test(upper)) return mapArrayType(hiveType);
  // STRUCT<...> → recursively map inner fields
  if (/^STRUCT\s*</.test(upper)) return mapStructType(hiveType);
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

// ─── Parse Hive CREATE TABLE from staging HQL ──────────────────────
function parseHiveTablesFromHQL(hqlContent) {
  const tables = {};

  // Remove all -- comments from each line (but preserve the structure)
  const lines = hqlContent.split('\n');
  const cleanedLines = lines.map(l => l.replace(/--.*$/, ''));
  const cleaned = cleanedLines.join('\n');

  // Match CREATE TABLE staging.table_name (...) PARTITIONED BY (...)
  // Some tables also have CLUSTERED BY (...) INTO N BUCKETS
  const regex = /CREATE\s+TABLE\s+staging\.(\w+)\s*\(([\s\S]*?)\)\s*\nPARTITIONED\s+BY\s*\(([^)]*)\)/gi;
  let match;
  while ((match = regex.exec(cleaned)) !== null) {
    const tableName = match[1];
    const colBlock = match[2];
    const partBlock = match[3];

    const columns = parseHiveColumnBlock(colBlock);
    const partitions = parseHivePartitionCols(partBlock);

    // Check for CLUSTERED BY clause after PARTITIONED BY
    let clusteredBy = null;
    let buckets = null;
    const afterPart = cleaned.substring(match.index + match[0].length);
    const clusterMatch = afterPart.match(/^\s*\nCLUSTERED\s+BY\s*\(([^)]*)\)\s+INTO\s+(\d+)\s+BUCKETS/i);
    if (clusterMatch) {
      clusteredBy = clusterMatch[1].trim().toLowerCase();
      buckets = parseInt(clusterMatch[2], 10);
    }

    tables[tableName] = { columns, partitions, clusteredBy, buckets };
  }
  return tables;
}

/**
 * Parse a Hive column block: split by top-level commas, extract name + type
 */
function parseHiveColumnBlock(colBlock) {
  const cols = [];
  const entries = splitTopLevel(colBlock, ',');

  for (let entry of entries) {
    entry = entry.trim();
    if (!entry) continue;
    const firstSpace = entry.indexOf(' ');
    if (firstSpace < 0) continue;
    let name = entry.substring(0, firstSpace).trim().toLowerCase();
    let type = entry.substring(firstSpace + 1).trim();

    // Clean up whitespace inside type
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

  const afterCols = stripped.substring(closeParen + 1).trim();

  // Extract PARTITION BY
  const partMatch = afterCols.match(/PARTITION\s+BY\s+(.+?)(?:\s*(?:CLUSTER|;|$))/si);
  if (partMatch) {
    result.partitionExpr = partMatch[1].trim().replace(/;$/, '').replace(/\n.*$/s, '').trim();
  }

  // Extract CLUSTER BY (full list)
  const clusterMatch = afterCols.match(/CLUSTER\s+BY\s+([^;]+)/i);
  if (clusterMatch) {
    result.clusterBy = clusterMatch[1].trim().replace(/;$/, '').trim();
  }

  return result;
}

function parseBQColumns(colBlock) {
  const entries = splitTopLevel(colBlock, ',');
  const cols = [];
  for (let entry of entries) {
    entry = entry.replace(/--.*$/gm, '').trim();
    if (!entry) continue;
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
// Describes the expected transformation for each staging table.
// droppedParts:  partition columns removed from BQ DDL
// syntheticCols: new columns added in BQ DDL (not in Hive source)
// promotedParts: partition columns that become regular data columns in BQ
// partition:     expected BQ PARTITION BY expression
// cluster:       expected BQ CLUSTER BY expression (null if none)

const TABLE_CONFIG = {
  // 6 tables with native DATE partitions — kept as-is
  cleansed_orders: {
    droppedParts: [],
    syntheticCols: [],
    promotedParts: [],
    partition: 'order_date',
    cluster: null
  },
  cleansed_customers: {
    droppedParts: [],
    syntheticCols: [],
    promotedParts: [],
    partition: 'load_date',
    cluster: null
  },
  cleansed_products: {
    droppedParts: [],
    syntheticCols: [],
    promotedParts: [],
    partition: 'load_date',
    cluster: null
  },
  geocoded_addresses: {
    droppedParts: [],
    syntheticCols: [],
    promotedParts: [],
    partition: 'load_date',
    cluster: null
  },
  merged_returns_cdc: {
    droppedParts: [],
    syntheticCols: [],
    promotedParts: [],
    partition: 'snapshot_date',
    cluster: null
  },
  fraud_scored: {
    droppedParts: [],
    syntheticCols: [],
    promotedParts: [],
    partition: 'score_date',
    cluster: null
  },

  // 3 tables with date_ts STRING → synthetic DATE partition
  parsed_loyalty_events: {
    droppedParts: ['date_ts'],
    syntheticCols: [{ name: 'event_date', type: 'DATE' }],
    promotedParts: [],
    partition: 'event_date',
    cluster: null
  },
  normalized_carrier_events: {
    droppedParts: ['date_ts'],
    syntheticCols: [{ name: 'event_date', type: 'DATE' }],
    promotedParts: [],
    partition: 'event_date',
    cluster: null
  },
  warehouse_kpi_snapshot: {
    droppedParts: ['date_ts'],
    syntheticCols: [{ name: 'snapshot_date', type: 'DATE' }],
    promotedParts: [],
    partition: 'snapshot_date',
    cluster: null
  },

  // 1 table with dual STRING partitions + bucketing → synthetic DATE + CLUSTER BY
  dedup_clickstream: {
    droppedParts: ['date_ts'],
    syntheticCols: [{ name: 'event_date', type: 'DATE' }],
    promotedParts: ['country_partition'],   // partition col → regular data column
    partition: 'event_date',
    cluster: 'country_partition, user_id'
  },
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

  // ─ Load Hive schemas from 06-staging-tables.hql ──────────────────
  const hqlContent = readFileSync(HIVE_HQL, 'utf-8');
  const allHiveTables = parseHiveTablesFromHQL(hqlContent);

  console.log(`Parsed ${Object.keys(allHiveTables).length} Hive tables from staging HQL`);
  console.log(`Expected: 10 tables\n`);

  // ─ Validate each table ───────────────────────────────────────────
  for (const [tableName, config] of Object.entries(TABLE_CONFIG)) {
    console.log(`\nTABLE: staging.${tableName}`);

    const hive = allHiveTables[tableName];
    if (!hive) {
      check(tableName, 'Source schema found in HQL', false, 'No Hive schema parsed');
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
        check(tableName, `Column ${col.name} present`, false,
          `Missing in BQ DDL (expected ${expectedBQ})`);
      } else {
        const normalA = actualBQ.replace(/\s+/g, ' ').toUpperCase();
        const normalE = expectedBQ.replace(/\s+/g, ' ').toUpperCase();
        check(tableName, `Column ${col.name} type: ${col.type} → ${normalA}`,
          normalA === normalE,
          normalA === normalE ? '' : `Expected ${normalE}, got ${normalA}`);
      }
    }

    // 2. Check Hive partition columns that are kept as-is have correct mapped types
    for (const pc of hive.partitions) {
      if (config.droppedParts.includes(pc.name)) continue;
      if (config.promotedParts.includes(pc.name)) continue;

      const expectedBQ = mapHiveType(pc.type);
      const actualBQ = bqColMap[pc.name];
      if (!actualBQ) {
        check(tableName, `Kept partition col ${pc.name} present`, false,
          `Missing in BQ DDL (expected ${expectedBQ})`);
      } else {
        const normalA = actualBQ.replace(/\s+/g, ' ').toUpperCase();
        const normalE = expectedBQ.replace(/\s+/g, ' ').toUpperCase();
        check(tableName, `Kept partition col ${pc.name} type: ${pc.type} → ${normalA}`,
          normalA === normalE,
          normalA === normalE ? '' : `Expected ${normalE}, got ${normalA}`);
      }
    }

    // 3. Check dropped partition columns are absent
    for (const dropped of config.droppedParts) {
      const present = bq.columns.some(c => c.name === dropped);
      check(tableName, `Dropped partition col ${dropped} absent`, !present,
        !present ? '' : `${dropped} should be dropped but is present`);
    }

    // 4. Check promoted partition columns are present as regular data columns
    for (const promoted of config.promotedParts) {
      const actual = bqColMap[promoted];
      check(tableName, `Promoted partition col ${promoted} present as data col`,
        !!actual,
        actual ? '' : `${promoted} should be a regular data column but is missing`);
      if (actual) {
        check(tableName, `Promoted col ${promoted} type: STRING → ${actual.toUpperCase()}`,
          actual.toUpperCase() === 'STRING',
          actual.toUpperCase() === 'STRING' ? '' : `Expected STRING, got ${actual}`);
      }
    }

    // 5. Check synthetic columns are present with correct type
    for (const syn of config.syntheticCols) {
      const actual = bqColMap[syn.name];
      if (!actual) {
        check(tableName, `Synthetic col ${syn.name} present`, false, 'Missing');
      } else {
        check(tableName, `Synthetic col ${syn.name} type: ${actual.toUpperCase()}`,
          actual.toUpperCase() === syn.type.toUpperCase(),
          actual.toUpperCase() === syn.type.toUpperCase()
            ? '' : `Expected ${syn.type}, got ${actual}`);
      }
    }

    // 6. Check partition expression
    check(tableName, `Partition expr = ${config.partition}`,
      bq.partitionExpr === config.partition,
      bq.partitionExpr === config.partition
        ? '' : `Expected "${config.partition}", got "${bq.partitionExpr}"`);

    // 7. Check cluster expression
    if (config.cluster) {
      check(tableName, `Cluster by = ${config.cluster}`,
        bq.clusterBy === config.cluster,
        bq.clusterBy === config.cluster
          ? '' : `Expected "${config.cluster}", got "${bq.clusterBy}"`);
    } else {
      check(tableName, 'No cluster by',
        !bq.clusterBy,
        !bq.clusterBy ? '' : `Expected no CLUSTER BY, got "${bq.clusterBy}"`);
    }

    // 8. Check no unexpected columns
    const expectedNames = new Set([
      ...hive.columns.map(c => c.name),
      ...config.syntheticCols.map(s => s.name),
      ...config.promotedParts,
    ]);
    // Keep partition cols that are not dropped
    for (const pc of hive.partitions) {
      if (!config.droppedParts.includes(pc.name) && !config.promotedParts.includes(pc.name)) {
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
