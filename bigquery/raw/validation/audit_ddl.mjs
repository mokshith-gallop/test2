#!/usr/bin/env node
// Systematic audit: Compare Hive source schema (from HQL files + Avro) against BigQuery DDL files
// This script parses BigQuery DDL files and compares against expected mappings from source schemas.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const TABLES_DIR = '/workspace/project/bigquery/raw/tables';

// ─── Type mapping rules ─────────────────────────────────────────────
const TYPE_MAP = {
  'string': 'STRING',
  'int': 'INT64',
  'bigint': 'INT64',
  'tinyint': 'INT64',
  'boolean': 'BOOL',
  'double': 'FLOAT64',
  'float': 'FLOAT64',
  'date': 'DATE',
  'timestamp': 'TIMESTAMP',
};

function mapHiveType(hiveType) {
  const t = hiveType.toLowerCase().trim();
  if (t.startsWith('decimal')) return 'NUMERIC';
  if (t.startsWith('map<')) return 'JSON';
  if (t.startsWith('struct<')) return mapStruct(t);
  if (t.startsWith('array<')) return mapArray(t);
  return TYPE_MAP[t] || `UNMAPPED(${t})`;
}

function mapStruct(t) {
  // Parse struct<field:type,...> → STRUCT<field TYPE,...>
  const inner = t.slice(7, -1); // remove 'struct<' and '>'
  const fields = splitStructFields(inner);
  const mapped = fields.map(f => {
    const colonIdx = f.indexOf(':');
    const name = f.slice(0, colonIdx).trim();
    const type = f.slice(colonIdx + 1).trim();
    return `${name} ${mapHiveType(type)}`;
  });
  return `STRUCT<${mapped.join(', ')}>`;
}

function mapArray(t) {
  const inner = t.slice(6, -1); // remove 'array<' and '>'
  return `ARRAY<${mapHiveType(inner)}>`;
}

function splitFields(s) {
  // Split on commas that are not inside angle brackets or parentheses
  const fields = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '<' || s[i] === '(') depth++;
    else if (s[i] === '>' || s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      fields.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  fields.push(s.slice(start).trim());
  return fields;
}

function splitStructFields(s) {
  // Split struct fields on commas not inside angle brackets or parentheses
  const fields = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '<' || s[i] === '(') depth++;
    else if (s[i] === '>' || s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      fields.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  fields.push(s.slice(start).trim());
  return fields;
}

// ─── Parse BigQuery DDL to extract columns, partition, cluster ──────
function parseBQDDL(ddl) {
  const cols = [];
  // Extract column block between first ( and matching )
  const createMatch = ddl.match(/CREATE\s+OR\s+REPLACE\s+TABLE\s+`[^`]+`\s*\(/is);
  if (!createMatch) return { cols: [], partition: null, cluster: null };
  
  let startIdx = createMatch.index + createMatch[0].length;
  let depth = 1;
  let endIdx = startIdx;
  for (let i = startIdx; i < ddl.length; i++) {
    if (ddl[i] === '(') depth++;
    if (ddl[i] === ')') depth--;
    if (depth === 0) { endIdx = i; break; }
  }
  
  const colBlock = ddl.slice(startIdx, endIdx);
  // Split on commas at depth 0
  const colDefs = splitFields(colBlock);
  
  for (const colDef of colDefs) {
    const trimmed = colDef.trim();
    if (!trimmed) continue;
    // First token is name, rest is type
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) continue;
    const name = trimmed.slice(0, spaceIdx).trim();
    const type = trimmed.slice(spaceIdx + 1).trim();
    // Normalize: remove trailing commas
    cols.push({ name, type: type.replace(/,\s*$/, '').trim() });
  }
  
  // Extract partition and cluster from the DDL (after closing paren of column block)
  const afterCols = ddl.slice(endIdx + 1);
  // Remove SQL comments
  const afterColsClean = afterCols.replace(/--.*$/gm, '').trim();
  
  // Extract partition clause
  const partMatch = afterColsClean.match(/PARTITION\s+BY\s+(.+?)(?:CLUSTER|;|$)/is);
  const partition = partMatch ? partMatch[1].trim().replace(/;$/, '').trim() : null;
  
  // Extract cluster clause
  const clusterMatch = afterColsClean.match(/CLUSTER\s+BY\s+([^;]+)/i);
  const cluster = clusterMatch ? clusterMatch[1].trim().replace(/;$/, '').trim() : null;
  
  return { cols, partition, cluster };
}

// ─── Source schemas from live Hive describe_table results ───────────
// These are the authoritative schemas from the live Hive database.
// Format: { colName: hiveType } for data columns, plus partition info.
const HIVE_SCHEMAS = {
  sales_retail: {
    dataCols: [
      { name: 'invoice_no', type: 'string' },
      { name: 'stock_code', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'quantity', type: 'int' },
      { name: 'invoice_date', type: 'string' },
      { name: 'unit_price', type: 'decimal(10,2)' },
      { name: 'customer_id', type: 'string' },
      { name: 'country', type: 'string' },
    ],
    partitionCols: [{ name: 'date_ts', type: 'string' }],
    group: 1,
  },
  omniture_logs: {
    dataCols: Array.from({ length: 60 }, (_, i) => ({ name: `col_${i + 1}`, type: 'string' })),
    partitionCols: [{ name: 'date_ts', type: 'string' }],
    group: 1,
  },
  pos_transactions: {
    dataCols: [
      { name: 'txn_id', type: 'bigint' },
      { name: 'store_id', type: 'string' },
      { name: 'register_id', type: 'string' },
      { name: 'cashier_id', type: 'string' },
      { name: 'customer_id', type: 'string' },
      { name: 'invoice_no', type: 'string' },
      { name: 'txn_ts', type: 'timestamp' },
      { name: 'line_count', type: 'int' },
      { name: 'gross_amount', type: 'decimal(14,2)' },
      { name: 'discount_amount', type: 'decimal(14,2)' },
      { name: 'tax_amount', type: 'decimal(14,2)' },
      { name: 'tender_type', type: 'string' },
      { name: 'void_flag', type: 'boolean' },
    ],
    partitionCols: [{ name: 'date_ts', type: 'string' }],
    group: 1,
  },
  loyalty_events: {
    dataCols: [
      { name: 'event_ts_str', type: 'string' },
      { name: 'member_id', type: 'string' },
      { name: 'event_type', type: 'string' },
      { name: 'points', type: 'string' },
      { name: 'store_id', type: 'string' },
      { name: 'tx_id', type: 'string' },
      { name: 'meta_raw', type: 'string' },
    ],
    partitionCols: [{ name: 'date_ts', type: 'string' }],
    group: 1,
  },
  email_campaign_clicks: {
    dataCols: [
      { name: 'campaign_id', type: 'string' },
      { name: 'send_id', type: 'string' },
      { name: 'recipient', type: 'string' },
      { name: 'clicked_at', type: 'timestamp' },
      { name: 'click_url', type: 'string' },
      { name: 'user_agent', type: 'string' },
      { name: 'ip_address', type: 'string' },
      { name: 'geo', type: 'struct<country:string,region:string,city:string>' },
      { name: 'utm', type: 'map<string,string>' },
    ],
    partitionCols: [{ name: 'date_ts', type: 'string' }],
    group: 1,
  },
  shipment_tracking: {
    dataCols: [
      { name: 'tracking_no', type: 'string' },
      { name: 'carrier', type: 'string' },
      { name: 'invoice_no', type: 'string' },
      { name: 'customer_id', type: 'string' },
      { name: 'shipped_at', type: 'timestamp' },
      { name: 'delivered_at', type: 'timestamp' },
      { name: 'status', type: 'string' },
      { name: 'last_location', type: 'string' },
      { name: 'estimated_eta', type: 'timestamp' },
    ],
    partitionCols: [{ name: 'date_ts', type: 'string' }, { name: 'carrier_partition', type: 'string' }],
    group: 1,
    expectedCluster: 'carrier_partition',
    promotedPartCols: ['carrier_partition'], // moved from partition to regular column
  },
  return_authorizations: {
    dataCols: [
      { name: 'rma_id', type: 'string' },
      { name: 'customer_id', type: 'string' },
      { name: 'invoice_no', type: 'string' },
      { name: 'stock_code', type: 'string' },
      { name: 'quantity', type: 'int' },
      { name: 'reason_code', type: 'string' },
      { name: 'reason_text', type: 'string' },
      { name: 'requested_at', type: 'timestamp' },
      { name: 'approved', type: 'boolean' },
      { name: 'refund_amount', type: 'decimal(12,2)' },
    ],
    partitionCols: [{ name: 'date_ts', type: 'string' }],
    group: 1,
  },
  delivery_routes: {
    dataCols: [
      { name: 'route_id', type: 'string' },
      { name: 'driver_id', type: 'string' },
      { name: 'vehicle_id', type: 'string' },
      { name: 'planned_stops', type: 'int' },
      { name: 'actual_stops', type: 'int' },
      { name: 'miles_driven', type: 'decimal(8,2)' },
      { name: 'fuel_used', type: 'decimal(8,2)' },
      { name: 'start_ts', type: 'timestamp' },
      { name: 'end_ts', type: 'timestamp' },
    ],
    partitionCols: [{ name: 'date_ts', type: 'string' }],
    group: 1,
  },
  driver_logs: {
    dataCols: [
      { name: 'driver_id', type: 'string' },
      { name: 'event_ts', type: 'timestamp' },
      { name: 'event_type', type: 'string' },
      { name: 'gps', type: 'struct<lat:double,lon:double>' },
      { name: 'notes', type: 'string' },
      { name: 'extras', type: 'map<string,string>' },
    ],
    partitionCols: [{ name: 'date_ts', type: 'string' }],
    group: 1,
  },
  customer_complaints: {
    dataCols: [
      { name: 'complaint_id', type: 'string' },
      { name: 'customer_id', type: 'string' },
      { name: 'invoice_no', type: 'string' },
      { name: 'channel', type: 'string' },
      { name: 'severity', type: 'string' },
      { name: 'summary', type: 'string' },
      { name: 'body', type: 'string' },
      { name: 'created_at', type: 'timestamp' },
      { name: 'resolved_at', type: 'timestamp' },
      { name: 'csat_score', type: 'int' },
    ],
    partitionCols: [{ name: 'date_ts', type: 'string' }],
    group: 1,
  },
  chat_transcripts: {
    dataCols: [
      { name: 'chat_id', type: 'string' },
      { name: 'customer_id', type: 'string' },
      { name: 'agent_id', type: 'string' },
      { name: 'started_at', type: 'timestamp' },
      { name: 'ended_at', type: 'timestamp' },
      { name: 'duration_sec', type: 'int' },
      { name: 'message_count', type: 'int' },
      { name: 'transcript', type: 'string' },
      { name: 'sentiment', type: 'decimal(4,3)' },
    ],
    partitionCols: [{ name: 'date_ts', type: 'string' }],
    group: 1,
  },
  warehouse_picks: {
    dataCols: [
      { name: 'pick_id', type: 'bigint' },
      { name: 'warehouse_id', type: 'string' },
      { name: 'bin_id', type: 'string' },
      { name: 'sku', type: 'string' },
      { name: 'picker_id', type: 'string' },
      { name: 'quantity', type: 'int' },
      { name: 'picked_at', type: 'timestamp' },
      { name: 'duration_ms', type: 'int' },
    ],
    partitionCols: [{ name: 'date_ts', type: 'string' }, { name: 'warehouse_id_partition', type: 'string' }],
    group: 1,
    expectedCluster: 'warehouse_id_partition',
    promotedPartCols: ['warehouse_id_partition'],
  },
  // Group 2
  inventory_movements: {
    dataCols: [
      { name: 'movement_id', type: 'bigint' },
      { name: 'sku', type: 'string' },
      { name: 'warehouse_id', type: 'string' },
      { name: 'bin_location', type: 'string' },
      { name: 'movement_type', type: 'string' },
      { name: 'quantity', type: 'int' },
      { name: 'movement_ts', type: 'timestamp' },
      { name: 'reference_doc', type: 'string' },
      { name: 'operator_id', type: 'string' },
      { name: 'reason_code', type: 'string' },
    ],
    partitionCols: [{ name: 'year', type: 'int' }, { name: 'month', type: 'int' }, { name: 'day', type: 'int' }],
    group: 2,
    syntheticPartCol: { name: 'movement_date', type: 'DATE' },
    expectedPartition: 'movement_date',
  },
  // Group 3
  supplier_invoices: {
    dataCols: [
      { name: 'invoice_no', type: 'string' },
      { name: 'supplier_id', type: 'string' },
      { name: 'invoice_date', type: 'date' },
      { name: 'due_date', type: 'date' },
      { name: 'total_amount', type: 'decimal(14,2)' },
      { name: 'currency', type: 'string' },
      { name: 'line_items', type: 'array<struct<sku:string,qty:int,unit_price:decimal(10,2)>>' },
      { name: 'raw_xml', type: 'string' },
    ],
    partitionCols: [{ name: 'feed_year', type: 'int' }, { name: 'feed_month', type: 'int' }],
    group: 3,
    syntheticPartCol: { name: 'feed_date', type: 'DATE' },
    expectedPartition: 'DATE_TRUNC(feed_date, MONTH)',
  },
  // Group 4
  product_catalog_feed: {
    dataCols: [
      { name: 'sku', type: 'string' },
      { name: 'supplier_id', type: 'string' },
      { name: 'upc', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'category', type: 'string' },
      { name: 'subcategory', type: 'string' },
      { name: 'color', type: 'string' },
      { name: 'size', type: 'string' },
      { name: 'msrp', type: 'decimal(10,2)' },
      { name: 'cost', type: 'decimal(10,2)' },
      { name: 'available_from', type: 'date' },
      { name: 'discontinued_at', type: 'date' },
      { name: 'metadata', type: 'map<string,string>' },
    ],
    partitionCols: [{ name: 'feed_date', type: 'string' }],
    group: 4,
    // feed_date STRING → feed_date DATE (type changes, name kept)
    syntheticPartCol: { name: 'feed_date', type: 'DATE' },
    expectedPartition: 'feed_date',
    droppedPartCols: [], // feed_date is kept but type changes
  },
  // Group 5
  mobile_events: {
    dataCols: [
      { name: 'event_id', type: 'string' },
      { name: 'event_ts', type: 'timestamp' },
      { name: 'user_id', type: 'string' },
      { name: 'app_version', type: 'string' },
      { name: 'device_type', type: 'string' },
      { name: 'platform', type: 'string' },
      { name: 'properties', type: 'map<string,string>' },
      { name: 'context', type: 'struct<ip:string,country:string,session_id:string,referrer:string>' },
      { name: 'items', type: 'array<struct<sku:string,qty:int,price:decimal(10,2)>>' },
    ],
    partitionCols: [{ name: 'event_date', type: 'string' }, { name: 'hour_bucket', type: 'tinyint' }],
    group: 5,
    syntheticPartCol: { name: 'event_timestamp', type: 'TIMESTAMP' },
    expectedPartition: 'TIMESTAMP_TRUNC(event_timestamp, HOUR)',
    expectedCluster: 'platform',
  },
  // Group 6
  returns_cdc: {
    dataCols: [
      { name: 'return_id', type: 'bigint' },
      { name: 'invoice_no', type: 'string' },
      { name: 'customer_sk', type: 'bigint' },
      { name: 'return_ts', type: 'timestamp' },
      { name: 'refund_amount', type: 'decimal(12,2)' },
      { name: 'reason_code', type: 'string' },
      { name: 'status', type: 'string' },
      { name: 'op', type: 'string' },
    ],
    partitionCols: [{ name: 'snapshot_date', type: 'date' }],
    group: 6,
    // snapshot_date DATE kept as-is
    syntheticPartCol: { name: 'snapshot_date', type: 'DATE' },
    expectedPartition: 'snapshot_date',
    droppedPartCols: [], // kept as-is
  },
  // Group 7 - Avro
  customer_signups: {
    dataCols: [
      { name: 'customer_id', type: 'string' },
      { name: 'email', type: 'string' },
      { name: 'phone', type: 'string' },
      { name: 'first_name', type: 'string' },
      { name: 'last_name', type: 'string' },
      { name: 'addr_line1', type: 'string' },
      { name: 'addr_city', type: 'string' },
      { name: 'addr_region', type: 'string' },
      { name: 'addr_country', type: 'string' },
      { name: 'addr_postal', type: 'string' },
      { name: 'signup_source', type: 'string' },
      { name: 'marketing_opt_in', type: 'boolean' },
    ],
    partitionCols: [{ name: 'signup_date', type: 'string' }],
    group: 7,
    syntheticPartCol: { name: 'signup_date', type: 'DATE' },
    expectedPartition: 'signup_date',
    droppedPartCols: [],
  },
  fraud_signals: {
    dataCols: [
      { name: 'customer_id', type: 'string' },
      { name: 'signal_type', type: 'string' },
      { name: 'score', type: 'double' },
      { name: 'risk_band', type: 'string' },
      { name: 'reason_codes', type: 'array<string>' },
      { name: 'signal_ts', type: 'timestamp' },
      { name: 'vendor', type: 'string' },
    ],
    partitionCols: [{ name: 'signal_date', type: 'string' }],
    group: 7,
    // signal_date STRING kept as regular column (used by view)
    // partition on signal_ts
    expectedPartition: 'TIMESTAMP_TRUNC(signal_ts, DAY)',
    keepPartColsAsRegular: ['signal_date'],
  },
};

// ─── Partition columns to drop per group ────────────────────────────
// Group 1: date_ts dropped (except promoted ones like carrier_partition)
// Group 2: year/month/day dropped
// Group 3: feed_year/feed_month dropped
// Group 4: feed_date kept (type changes)
// Group 5: event_date/hour_bucket dropped
// Group 6: snapshot_date kept (type stays DATE)
// Group 7: signup_date kept (type changes); signal_date kept as regular

function getDroppedPartCols(schema) {
  if (schema.droppedPartCols !== undefined) return schema.droppedPartCols;
  
  const promoted = new Set(schema.promotedPartCols || []);
  const keptAsRegular = new Set(schema.keepPartColsAsRegular || []);
  
  if (schema.group === 1) {
    return schema.partitionCols
      .filter(c => c.name === 'date_ts')
      .map(c => c.name);
  }
  if (schema.group === 2) return ['year', 'month', 'day'];
  if (schema.group === 3) return ['feed_year', 'feed_month'];
  if (schema.group === 5) return ['event_date', 'hour_bucket'];
  return [];
}

function getSyntheticCols(schema) {
  const cols = [];
  // Group 1: partition_ts TIMESTAMP (unless custom synthetic defined)
  if (schema.group === 1) {
    cols.push({ name: 'partition_ts', type: 'TIMESTAMP' });
  }
  if (schema.syntheticPartCol && schema.group !== 1) {
    // Check if this col already exists as a data col or partition col being kept
    const existingNames = new Set([
      ...schema.dataCols.map(c => c.name),
      ...(schema.keepPartColsAsRegular || []),
    ]);
    if (!existingNames.has(schema.syntheticPartCol.name)) {
      cols.push(schema.syntheticPartCol);
    }
  }
  return cols;
}

// ─── Main audit ─────────────────────────────────────────────────────
let totalIssues = 0;
const issuesList = [];

for (const [tableName, schema] of Object.entries(HIVE_SCHEMAS)) {
  const ddlPath = join(TABLES_DIR, `${tableName}.sql`);
  let ddl;
  try {
    ddl = readFileSync(ddlPath, 'utf-8');
  } catch (err) {
    console.error(`✗ ${tableName}: DDL file not found at ${ddlPath}`);
    totalIssues++;
    continue;
  }
  
  const parsed = parseBQDDL(ddl);
  const bqColMap = new Map(parsed.cols.map(c => [c.name, c.type]));
  const issues = [];
  
  // 1. Check data columns are present with correct types
  for (const col of schema.dataCols) {
    const expectedType = mapHiveType(col.type);
    const actualType = bqColMap.get(col.name);
    if (!actualType) {
      issues.push(`  MISSING column: ${col.name} (expected ${expectedType})`);
    } else if (normalizeType(actualType) !== normalizeType(expectedType)) {
      issues.push(`  TYPE MISMATCH: ${col.name} — expected ${expectedType}, got ${actualType}`);
    }
  }
  
  // 2. Check promoted partition cols are present as regular columns
  for (const pName of (schema.promotedPartCols || [])) {
    const partCol = schema.partitionCols.find(c => c.name === pName);
    if (partCol) {
      const expectedType = mapHiveType(partCol.type);
      const actualType = bqColMap.get(pName);
      if (!actualType) {
        issues.push(`  MISSING promoted partition col: ${pName} (expected ${expectedType})`);
      } else if (normalizeType(actualType) !== normalizeType(expectedType)) {
        issues.push(`  TYPE MISMATCH (promoted): ${pName} — expected ${expectedType}, got ${actualType}`);
      }
    }
  }
  
  // 3. Check kept-as-regular partition cols
  for (const pName of (schema.keepPartColsAsRegular || [])) {
    const partCol = schema.partitionCols.find(c => c.name === pName);
    if (partCol) {
      const expectedType = mapHiveType(partCol.type);
      const actualType = bqColMap.get(pName);
      if (!actualType) {
        issues.push(`  MISSING kept partition col: ${pName} (expected ${expectedType})`);
      }
      // Type might change (e.g., kept as STRING)
    }
  }
  
  // 4. Check dropped partition columns are NOT present
  const dropped = getDroppedPartCols(schema);
  for (const name of dropped) {
    if (bqColMap.has(name)) {
      issues.push(`  SHOULD BE DROPPED: partition col ${name} still present in DDL`);
    }
  }
  
  // 5. Check synthetic columns are present
  const synthetics = getSyntheticCols(schema);
  for (const synth of synthetics) {
    const actualType = bqColMap.get(synth.name);
    if (!actualType) {
      issues.push(`  MISSING synthetic col: ${synth.name} (expected ${synth.type})`);
    } else if (normalizeType(actualType) !== normalizeType(synth.type)) {
      issues.push(`  TYPE MISMATCH (synthetic): ${synth.name} — expected ${synth.type}, got ${actualType}`);
    }
  }
  
  // 6. Check for unexpected columns
  const expectedNames = new Set([
    ...schema.dataCols.map(c => c.name),
    ...(schema.promotedPartCols || []),
    ...(schema.keepPartColsAsRegular || []),
    ...synthetics.map(c => c.name),
  ]);
  // For group 4 (product_catalog_feed) and group 6 (returns_cdc), the partition col is kept
  if (schema.syntheticPartCol) {
    expectedNames.add(schema.syntheticPartCol.name);
  }
  // For group 7 customer_signups, signup_date is both partition col and synthetic
  for (const bqCol of parsed.cols) {
    if (!expectedNames.has(bqCol.name)) {
      issues.push(`  UNEXPECTED column: ${bqCol.name} (type: ${bqCol.type})`);
    }
  }
  
  // 7. Check partition clause
  if (schema.group === 1) {
    const expectedPart = 'TIMESTAMP_TRUNC(partition_ts, HOUR)';
    if (!parsed.partition || normalizePartition(parsed.partition) !== normalizePartition(expectedPart)) {
      issues.push(`  PARTITION MISMATCH: expected ${expectedPart}, got ${parsed.partition}`);
    }
  } else if (schema.expectedPartition) {
    if (!parsed.partition || normalizePartition(parsed.partition) !== normalizePartition(schema.expectedPartition)) {
      issues.push(`  PARTITION MISMATCH: expected ${schema.expectedPartition}, got ${parsed.partition}`);
    }
  }
  
  // 8. Check cluster clause
  if (schema.expectedCluster) {
    if (!parsed.cluster || parsed.cluster !== schema.expectedCluster) {
      issues.push(`  CLUSTER MISMATCH: expected ${schema.expectedCluster}, got ${parsed.cluster}`);
    }
  } else {
    if (parsed.cluster) {
      issues.push(`  UNEXPECTED CLUSTER: ${parsed.cluster} (none expected)`);
    }
  }
  
  // 9. Check no SerDe/STORED AS references in DDL content
  if (/STORED\s+AS/i.test(ddl.replace(/--.*$/gm, ''))) {
    issues.push(`  CONTAINS 'STORED AS' clause (should be native BigQuery)`);
  }
  if (/SERDE/i.test(ddl.replace(/--.*$/gm, ''))) {
    issues.push(`  CONTAINS 'SERDE' clause (should be native BigQuery)`);
  }
  
  if (issues.length > 0) {
    console.log(`✗ ${tableName} (Group ${schema.group}):`);
    issues.forEach(i => console.log(i));
    totalIssues += issues.length;
    issuesList.push(...issues.map(i => `${tableName}: ${i.trim()}`));
  } else {
    console.log(`✓ ${tableName} (Group ${schema.group}) — OK`);
  }
}

function normalizeType(t) {
  return t.replace(/\s+/g, ' ').trim().toUpperCase();
}

function normalizePartition(p) {
  return p.replace(/\s+/g, ' ').replace(/;/g, '').trim();
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Total issues found: ${totalIssues}`);
if (totalIssues > 0) {
  console.log('\nIssues summary:');
  issuesList.forEach(i => console.log(`  - ${i}`));
}
process.exit(totalIssues > 0 ? 1 : 0);
