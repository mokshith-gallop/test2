// Dry-run validation for Groups 2-6 (5 specialty-partitioned tables)
// Reads each .sql file, rewrites the dataset reference to the test dataset,
// then executes a BigQuery dry-run to check for syntax errors.

const { BigQuery } = require('@google-cloud/bigquery');
const { OAuth2Client } = require('google-auth-library');
const { readFileSync } = require('fs');
const { join } = require('path');

async function main() {
  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: process.env.TEST_BQ_TOKEN });
  const bq = new BigQuery({ projectId: process.env.TEST_BQ_PROJECT, authClient });

  const tablesDir = '/workspace/project/bigquery/raw/tables';

  // Group 2-6 tables
  const tables = [
    'inventory_movements',   // Group 2
    'supplier_invoices',     // Group 3
    'product_catalog_feed',  // Group 4
    'mobile_events',         // Group 5
    'returns_cdc'            // Group 6
  ];

  let passed = 0;
  let failed = 0;

  for (const tableName of tables) {
    const file = `${tableName}.sql`;
    const filePath = join(tablesDir, file);
    let ddl = readFileSync(filePath, 'utf-8');

    // Replace the target dataset with test dataset for dry-run
    ddl = ddl.replace(/`acme-analytics\.raw\./g, `\`${process.env.TEST_BQ_PROJECT}.test.`);

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
