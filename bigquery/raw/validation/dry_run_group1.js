// Dry-run validation for Group 1 (12 date_ts tables)
// Reads each .sql file, rewrites the dataset reference to the test dataset,
// then executes a BigQuery dry-run to check for syntax errors.

const { BigQuery } = require('@google-cloud/bigquery');
const { OAuth2Client } = require('google-auth-library');
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

async function main() {
  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: process.env.TEST_BQ_TOKEN });
  const bq = new BigQuery({ projectId: process.env.TEST_BQ_PROJECT, authClient });

  const tablesDir = '/workspace/project/bigquery/raw/tables';

  // Group 1 tables only
  const group1 = [
    'sales_retail', 'omniture_logs', 'pos_transactions', 'loyalty_events',
    'email_campaign_clicks', 'return_authorizations', 'delivery_routes',
    'driver_logs', 'customer_complaints', 'chat_transcripts',
    'shipment_tracking', 'warehouse_picks'
  ];

  let passed = 0;
  let failed = 0;

  for (const tableName of group1) {
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
  console.log(`Passed: ${passed}/${group1.length}`);
  console.log(`Failed: ${failed}/${group1.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
