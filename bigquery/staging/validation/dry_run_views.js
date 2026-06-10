// Dry-run validation for the staging view (AC-1, AC-6)
// The v_returns_pending view references raw.return_authorizations,
// so we must first create a stub table in the test dataset for
// BigQuery to resolve column references during dry-run.
//
// Steps:
//   1. Create stub return_authorizations table in test dataset
//   2. Wait for metadata propagation
//   3. Dry-run the v_returns_pending view DDL
//   4. Clean up: drop the stub table and view

const { BigQuery } = require('@google-cloud/bigquery');
const { OAuth2Client } = require('google-auth-library');
const { readFileSync } = require('fs');
const { join } = require('path');

const PROJECT = process.env.TEST_BQ_PROJECT;
const DATASET = 'test';

function rewriteDataset(ddl) {
  // Rewrite both staging and raw references to the test dataset
  return ddl
    .replace(/`acme-analytics\.staging\./g, `\`${PROJECT}.${DATASET}.`)
    .replace(/`acme-analytics\.raw\./g, `\`${PROJECT}.${DATASET}.`);
}

async function main() {
  if (!process.env.TEST_BQ_TOKEN) {
    console.error('ERROR: TEST_BQ_TOKEN not set. Run: set -a; source /workspace/.gallop/db.env; set +a');
    process.exit(1);
  }
  if (!PROJECT) {
    console.error('ERROR: TEST_BQ_PROJECT not set.');
    process.exit(1);
  }

  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: process.env.TEST_BQ_TOKEN });
  const bq = new BigQuery({ projectId: PROJECT, authClient });

  const viewsDir = '/workspace/project/bigquery/staging/views';
  const rawTablesDir = '/workspace/project/bigquery/raw/tables';

  let passed = 0;
  let failed = 0;
  const total = 1; // 1 view

  // ─── Phase 1: Create stub return_authorizations table ─────────────
  // The view references raw.return_authorizations — we use the actual
  // raw layer DDL rewritten to the test dataset so all columns resolve.
  console.log('Staging DDL Dry-Run: 1 View');
  console.log('===========================\n');

  console.log('--- Creating stub base table for view validation ---');
  const stubDDL = readFileSync(join(rawTablesDir, 'return_authorizations.sql'), 'utf-8');
  const rewrittenStub = rewriteDataset(stubDDL);

  const createdTables = [];
  try {
    const [job] = await bq.createQueryJob({
      query: rewrittenStub,
      useLegacySql: false
    });
    await job.getQueryResults();
    console.log(`  Created ${DATASET}.return_authorizations (stub)`);
    createdTables.push('return_authorizations');
  } catch (err) {
    console.error(`  WARN: Could not create stub return_authorizations: ${err.message}`);
  }

  // Wait for table metadata to propagate in BigQuery
  console.log('  Waiting 5s for table metadata propagation...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // ─── Phase 2: Dry-run the view DDL ────────────────────────────────
  console.log('\n--- Dry-running view ---');
  const viewFile = 'v_returns_pending.sql';
  let viewDDL = readFileSync(join(viewsDir, viewFile), 'utf-8');
  viewDDL = rewriteDataset(viewDDL);

  try {
    const [job] = await bq.createQueryJob({
      query: viewDDL,
      dryRun: true,
      useLegacySql: false
    });
    console.log(`✓ views/${viewFile} — dry-run OK`);
    passed++;
  } catch (err) {
    console.error(`✗ views/${viewFile} — ERROR: ${err.message}`);
    failed++;
  }

  // ─── Phase 3: Cleanup — drop stub table and view ──────────────────
  console.log('\n--- Cleaning up ---');

  // Drop view first (depends on table)
  try {
    const [job] = await bq.createQueryJob({
      query: `DROP VIEW IF EXISTS \`${PROJECT}.${DATASET}.v_returns_pending\``,
      useLegacySql: false
    });
    await job.getQueryResults();
    console.log(`  Dropped view ${DATASET}.v_returns_pending`);
  } catch (err) {
    // Ignore — view might not have been created (dry-run only)
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
