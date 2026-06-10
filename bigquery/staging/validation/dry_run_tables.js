// Dry-run validation for all 10 staging table DDLs (AC-1)
// Reads each .sql file from bigquery/staging/tables/,
// rewrites the dataset reference to the test dataset,
// then executes a BigQuery dry-run to check for syntax errors.

const { BigQuery } = require('@google-cloud/bigquery');
const { OAuth2Client } = require('google-auth-library');
const { readFileSync } = require('fs');
const { join } = require('path');

const PROJECT = process.env.TEST_BQ_PROJECT;
const DATASET = 'test';

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

  const tablesDir = '/workspace/project/bigquery/staging/tables';

  const tables = [
    'cleansed_orders',
    'cleansed_customers',
    'cleansed_products',
    'dedup_clickstream',
    'geocoded_addresses',
    'parsed_loyalty_events',
    'merged_returns_cdc',
    'normalized_carrier_events',
    'fraud_scored',
    'warehouse_kpi_snapshot'
  ];

  let passed = 0;
  let failed = 0;

  console.log('Staging DDL Dry-Run: 10 Tables');
  console.log('==============================\n');

  for (const tableName of tables) {
    const file = `${tableName}.sql`;
    const filePath = join(tablesDir, file);
    let ddl = readFileSync(filePath, 'utf-8');

    // Replace the target dataset with test dataset for dry-run
    ddl = ddl.replace(/`acme-analytics\.staging\./g, `\`${PROJECT}.${DATASET}.`);

    try {
      const [job] = await bq.createQueryJob({
        query: ddl,
        dryRun: true,
        useLegacySql: false
      });
      console.log(`✓ ${file} — dry-run OK`);
      passed++;
    } catch (err) {
      console.error(`✗ ${file} — ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Passed: ${passed}/${tables.length}`);
  console.log(`Failed: ${failed}/${tables.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
