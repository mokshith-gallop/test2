// Dry-run validation for Group 7 (2 Avro tables) + 2 views
// For tables: standard dry-run.
// For views: must first CREATE the base tables in the test dataset,
//            then dry-run the views, then DROP the temp tables.

const { BigQuery } = require('@google-cloud/bigquery');
const { OAuth2Client } = require('google-auth-library');
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const PROJECT = process.env.TEST_BQ_PROJECT;
const DATASET = 'test';

function rewriteDataset(ddl) {
  return ddl.replace(/`acme-analytics\.raw\./g, `\`${PROJECT}.${DATASET}.`);
}

async function main() {
  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: process.env.TEST_BQ_TOKEN });
  const bq = new BigQuery({ projectId: PROJECT, authClient });

  const tablesDir = '/workspace/project/bigquery/raw/tables';
  const viewsDir = '/workspace/project/bigquery/raw/views';

  let passed = 0;
  let failed = 0;
  const total = 4;

  // ─── Phase 1: Dry-run the 2 Avro table DDLs ───────────────────────
  const avroTables = ['customer_signups', 'fraud_signals'];
  for (const tableName of avroTables) {
    const file = `${tableName}.sql`;
    const filePath = join(tablesDir, file);
    let ddl = readFileSync(filePath, 'utf-8');
    ddl = rewriteDataset(ddl);

    try {
      const [job] = await bq.createQueryJob({
        query: ddl,
        dryRun: true,
        useLegacySql: false
      });
      console.log(`✓ tables/${file} — dry-run OK`);
      passed++;
    } catch (err) {
      console.error(`✗ tables/${file} — ERROR: ${err.message}`);
      failed++;
    }
  }

  // ─── Phase 2: Create base tables needed by views ──────────────────
  // Views reference omniture_logs and fraud_signals, so we need those
  // tables to actually exist (not just dry-run) in the test dataset.
  // We'll create all 17 table DDLs that views might reference.
  const baseTables = ['omniture_logs', 'fraud_signals'];
  const createdTables = [];

  console.log('\n--- Creating temp base tables for view validation ---');
  for (const tableName of baseTables) {
    const file = `${tableName}.sql`;
    const filePath = join(tablesDir, file);
    let ddl = readFileSync(filePath, 'utf-8');
    ddl = rewriteDataset(ddl);

    try {
      const [job] = await bq.createQueryJob({
        query: ddl,
        useLegacySql: false
      });
      await job.getQueryResults();
      console.log(`  Created ${DATASET}.${tableName}`);
      createdTables.push(tableName);
    } catch (err) {
      console.error(`  WARN: Could not create ${DATASET}.${tableName}: ${err.message}`);
    }
  }

  // Wait for table metadata to propagate in BigQuery
  console.log('  Waiting 5s for table metadata propagation...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // ─── Phase 3: Dry-run the 2 view DDLs ─────────────────────────────
  console.log('\n--- Dry-running views ---');
  const views = ['omniture', 'v_fraud_signals_recent'];
  for (const viewName of views) {
    const file = `${viewName}.sql`;
    const filePath = join(viewsDir, file);
    let ddl = readFileSync(filePath, 'utf-8');
    ddl = rewriteDataset(ddl);

    try {
      const [job] = await bq.createQueryJob({
        query: ddl,
        dryRun: true,
        useLegacySql: false
      });
      console.log(`✓ views/${file} — dry-run OK`);
      passed++;
    } catch (err) {
      console.error(`✗ views/${file} — ERROR: ${err.message}`);
      failed++;
    }
  }

  // ─── Phase 4: Cleanup — drop temp tables and views ─────────────────
  console.log('\n--- Cleaning up temp tables ---');
  // Drop views first (they depend on tables)
  for (const viewName of views) {
    try {
      await bq.createQueryJob({
        query: `DROP VIEW IF EXISTS \`${PROJECT}.${DATASET}.${viewName}\``,
        useLegacySql: false
      });
      console.log(`  Dropped view ${DATASET}.${viewName}`);
    } catch (err) {
      // Ignore — view might not have been created
    }
  }
  for (const tableName of createdTables) {
    try {
      const [job] = await bq.createQueryJob({
        query: `DROP TABLE IF EXISTS \`${PROJECT}.${DATASET}.${tableName}\``,
        useLegacySql: false
      });
      await job.getQueryResults();
      console.log(`  Dropped ${DATASET}.${tableName}`);
    } catch (err) {
      console.error(`  WARN: Could not drop ${DATASET}.${tableName}: ${err.message}`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Passed: ${passed}/${total}`);
  console.log(`Failed: ${failed}/${total}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
