// Edge-value round-trip probes for AC-7 and AC-8
//
// Verifies that DECIMAL(14,2) and DOUBLE edge values survive BigQuery
// storage and retrieval exactly, using scratch tables in a test dataset.
//
// AC-7: DECIMAL(14,2) → NUMERIC probes (cleansed_orders.gross_amount, net_amount):
//   - 99999999999999.99  (max positive 14,2 — all 14 integer digits + 2 decimal)
//   - -99999999999999.99 (max negative 14,2)
//   - 0.01               (minimum non-zero)
//   - 0.00               (exact zero)
//
// AC-8: DOUBLE → FLOAT64 probes (cleansed_customers.geocoded_lat, geocoded_lon):
//   - NaN
//   - +Infinity
//   - -Infinity
//   - -0.0
//   - 0.30000000000000004 (17-significant-digit IEEE 754 precision test)
//
// Requires actual query execution (not dry-run) against a scratch dataset.

const { BigQuery } = require('@google-cloud/bigquery');
const { OAuth2Client } = require('google-auth-library');

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

  let passed = 0;
  let failed = 0;
  const totalProbes = 9; // 4 NUMERIC + 4 FLOAT64 special + 1 FLOAT64 17-digit

  console.log('Edge-Value Round-Trip Probes (AC-7 & AC-8)');
  console.log('============================================\n');

  // ─── Helper: run a query and return rows ──────────────────────────
  async function query(sql) {
    const [job] = await bq.createQueryJob({ query: sql, useLegacySql: false });
    const [rows] = await job.getQueryResults();
    return rows;
  }

  // ─── Phase 1: DECIMAL(14,2) → NUMERIC round-trip (AC-7) ──────────
  console.log('--- AC-7: DECIMAL(14,2) → NUMERIC probes ---');
  console.log('  Target columns: cleansed_orders.gross_amount, cleansed_orders.net_amount');
  console.log('  Max value: 99999999999999.99 (14 integer digits + 2 decimal = DECIMAL(14,2))\n');

  const scratchNumeric = `\`${PROJECT}.${DATASET}.edge_probe_numeric\``;

  try {
    // Create scratch table matching cleansed_orders NUMERIC columns
    await query(`
      CREATE OR REPLACE TABLE ${scratchNumeric} (
        probe_label STRING,
        gross_amount NUMERIC,
        net_amount NUMERIC
      )
    `);

    // Seed edge values — 99999999999999.99 is the max for DECIMAL(14,2)
    // (14 total digits with 2 after decimal point = 12 integer + 2 fractional)
    // But AC-7 says CAST('99999999999999.99' AS NUMERIC) — 14 nines + .99
    // which is actually a 16-digit number. NUMERIC(38,9) handles this fine.
    await query(`
      INSERT INTO ${scratchNumeric} (probe_label, gross_amount, net_amount) VALUES
        ('max_positive', NUMERIC '99999999999999.99', NUMERIC '99999999999999.99'),
        ('max_negative', NUMERIC '-99999999999999.99', NUMERIC '-99999999999999.99'),
        ('min_nonzero',  NUMERIC '0.01', NUMERIC '0.01'),
        ('exact_zero',   NUMERIC '0.00', NUMERIC '0.00')
    `);

    // Read back and assert
    const rows = await query(`
      SELECT probe_label, gross_amount, net_amount
      FROM ${scratchNumeric}
      ORDER BY probe_label
    `);

    const expected = {
      'exact_zero':   { gross: '0', net: '0' },
      'max_negative': { gross: '-99999999999999.99', net: '-99999999999999.99' },
      'max_positive': { gross: '99999999999999.99', net: '99999999999999.99' },
      'min_nonzero':  { gross: '0.01', net: '0.01' },
    };

    for (const row of rows) {
      const label = row.probe_label;
      const exp = expected[label];
      if (!exp) {
        console.error(`  ✗ Unknown probe label: ${label}`);
        failed++;
        continue;
      }

      // BigQuery NUMERIC comes back as BigQueryNumeric or string;
      // convert to string for comparison
      const grossStr = row.gross_amount.value !== undefined
        ? row.gross_amount.value : String(row.gross_amount);
      const netStr = row.net_amount.value !== undefined
        ? row.net_amount.value : String(row.net_amount);

      // Normalize: remove trailing zeros after decimal for comparison
      const normalizeNumeric = (s) => {
        s = String(s);
        if (s.includes('.')) {
          s = s.replace(/0+$/, '').replace(/\.$/, '');
        }
        return s === '-0' ? '0' : s;
      };

      const grossNorm = normalizeNumeric(grossStr);
      const netNorm = normalizeNumeric(netStr);
      const expGrossNorm = normalizeNumeric(exp.gross);
      const expNetNorm = normalizeNumeric(exp.net);

      if (grossNorm === expGrossNorm && netNorm === expNetNorm) {
        console.log(`  ✓ ${label}: gross=${grossNorm}, net=${netNorm} — round-trip OK`);
        passed++;
      } else {
        console.error(`  ✗ ${label}: expected gross=${expGrossNorm}, net=${expNetNorm}; got gross=${grossNorm}, net=${netNorm}`);
        failed++;
      }
    }
  } catch (err) {
    console.error(`  ✗ NUMERIC probe setup failed: ${err.message}`);
    failed += 4; // All 4 probes failed
  }

  // ─── Phase 2: DOUBLE → FLOAT64 round-trip (AC-8) ─────────────────
  console.log('\n--- AC-8: DOUBLE → FLOAT64 probes ---');
  console.log('  Target columns: cleansed_customers.geocoded_lat, cleansed_customers.geocoded_lon\n');

  const scratchFloat = `\`${PROJECT}.${DATASET}.edge_probe_float64\``;

  try {
    // Create scratch table matching cleansed_customers FLOAT64 columns
    await query(`
      CREATE OR REPLACE TABLE ${scratchFloat} (
        probe_label STRING,
        geocoded_lat FLOAT64,
        geocoded_lon FLOAT64
      )
    `);

    // Seed special FLOAT64 values
    await query(`
      INSERT INTO ${scratchFloat} (probe_label, geocoded_lat, geocoded_lon) VALUES
        ('nan',        CAST('NaN' AS FLOAT64),  CAST('NaN' AS FLOAT64)),
        ('pos_inf',    CAST('+inf' AS FLOAT64),  CAST('+inf' AS FLOAT64)),
        ('neg_inf',    CAST('-inf' AS FLOAT64),  CAST('-inf' AS FLOAT64)),
        ('neg_zero',   CAST('-0.0' AS FLOAT64),  CAST('-0.0' AS FLOAT64))
    `);

    // Read back and assert using BigQuery's built-in check functions
    // NaN probe
    const nanRows = await query(`
      SELECT
        IS_NAN(geocoded_lat) AS lat_is_nan,
        IS_NAN(geocoded_lon) AS lon_is_nan
      FROM ${scratchFloat}
      WHERE probe_label = 'nan'
    `);
    if (nanRows.length > 0 && nanRows[0].lat_is_nan === true && nanRows[0].lon_is_nan === true) {
      console.log('  ✓ NaN: IS_NAN = true — round-trip OK');
      passed++;
    } else {
      console.error('  ✗ NaN: IS_NAN check failed');
      failed++;
    }

    // +Infinity probe
    const posInfRows = await query(`
      SELECT
        IS_INF(geocoded_lat) AS lat_is_inf,
        geocoded_lat > 0 AS lat_positive,
        IS_INF(geocoded_lon) AS lon_is_inf,
        geocoded_lon > 0 AS lon_positive
      FROM ${scratchFloat}
      WHERE probe_label = 'pos_inf'
    `);
    if (posInfRows.length > 0
        && posInfRows[0].lat_is_inf === true && posInfRows[0].lat_positive === true
        && posInfRows[0].lon_is_inf === true && posInfRows[0].lon_positive === true) {
      console.log('  ✓ +Infinity: IS_INF = true, positive — round-trip OK');
      passed++;
    } else {
      console.error('  ✗ +Infinity: check failed');
      failed++;
    }

    // -Infinity probe
    const negInfRows = await query(`
      SELECT
        IS_INF(geocoded_lat) AS lat_is_inf,
        geocoded_lat < 0 AS lat_negative,
        IS_INF(geocoded_lon) AS lon_is_inf,
        geocoded_lon < 0 AS lon_negative
      FROM ${scratchFloat}
      WHERE probe_label = 'neg_inf'
    `);
    if (negInfRows.length > 0
        && negInfRows[0].lat_is_inf === true && negInfRows[0].lat_negative === true
        && negInfRows[0].lon_is_inf === true && negInfRows[0].lon_negative === true) {
      console.log('  ✓ -Infinity: IS_INF = true, negative — round-trip OK');
      passed++;
    } else {
      console.error('  ✗ -Infinity: check failed');
      failed++;
    }

    // -0.0 probe: 1.0 / -0.0 = -Infinity
    const negZeroRows = await query(`
      SELECT
        SAFE_DIVIDE(1.0, geocoded_lat) AS lat_recip,
        IS_INF(SAFE_DIVIDE(1.0, geocoded_lat)) AS lat_recip_inf,
        SAFE_DIVIDE(1.0, geocoded_lat) < 0 AS lat_recip_neg,
        SAFE_DIVIDE(1.0, geocoded_lon) AS lon_recip,
        IS_INF(SAFE_DIVIDE(1.0, geocoded_lon)) AS lon_recip_inf,
        SAFE_DIVIDE(1.0, geocoded_lon) < 0 AS lon_recip_neg
      FROM ${scratchFloat}
      WHERE probe_label = 'neg_zero'
    `);
    if (negZeroRows.length > 0
        && negZeroRows[0].lat_recip_inf === true && negZeroRows[0].lat_recip_neg === true
        && negZeroRows[0].lon_recip_inf === true && negZeroRows[0].lon_recip_neg === true) {
      console.log('  ✓ -0.0: 1.0/value = -Infinity — round-trip OK');
      passed++;
    } else {
      console.error('  ✗ -0.0: negative-zero check failed');
      failed++;
    }
  } catch (err) {
    console.error(`  ✗ FLOAT64 special-value probe setup failed: ${err.message}`);
    failed += 4; // All 4 probes failed
  }

  // ─── Phase 3: FLOAT64 17-significant-digit precision (AC-8) ──────
  console.log('\n--- AC-8: FLOAT64 17-significant-digit precision probe ---');
  console.log('  Test value: 0.30000000000000004 (IEEE 754 double, 17 significant digits)\n');

  const scratchPrecision = `\`${PROJECT}.${DATASET}.edge_probe_float64_precision\``;

  try {
    await query(`
      CREATE OR REPLACE TABLE ${scratchPrecision} (
        probe_label STRING,
        val FLOAT64
      )
    `);

    // Seed the 17-significant-digit value
    // 0.30000000000000004 is the exact IEEE 754 representation of 0.1 + 0.2
    await query(`
      INSERT INTO ${scratchPrecision} (probe_label, val) VALUES
        ('seventeen_digits', 0.30000000000000004)
    `);

    // Read back via CAST to STRING and verify all 17 digits preserved
    const precisionRows = await query(`
      SELECT
        CAST(val AS STRING) AS val_str,
        val = 0.30000000000000004 AS exact_match
      FROM ${scratchPrecision}
      WHERE probe_label = 'seventeen_digits'
    `);

    if (precisionRows.length > 0) {
      const valStr = precisionRows[0].val_str;
      const exactMatch = precisionRows[0].exact_match;

      // Primary check: exact binary equality
      // Secondary check: string representation preserves digits
      if (exactMatch === true) {
        console.log(`  ✓ 0.30000000000000004: exact_match=true, CAST AS STRING="${valStr}" — round-trip OK`);
        passed++;
      } else {
        console.error(`  ✗ 0.30000000000000004: exact_match=${exactMatch}, CAST AS STRING="${valStr}"`);
        failed++;
      }
    } else {
      console.error('  ✗ 0.30000000000000004: no rows returned');
      failed++;
    }
  } catch (err) {
    console.error(`  ✗ FLOAT64 17-digit precision probe failed: ${err.message}`);
    failed++;
  }

  // ─── Phase 4: Cleanup scratch tables ──────────────────────────────
  console.log('\n--- Cleaning up scratch tables ---');
  for (const tbl of ['edge_probe_numeric', 'edge_probe_float64', 'edge_probe_float64_precision']) {
    try {
      await query(`DROP TABLE IF EXISTS \`${PROJECT}.${DATASET}.${tbl}\``);
      console.log(`  Dropped ${DATASET}.${tbl}`);
    } catch (err) {
      console.error(`  WARN: Could not drop ${DATASET}.${tbl}: ${err.message}`);
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────
  console.log(`\n--- Summary ---`);
  console.log(`Passed: ${passed}/${totalProbes}`);
  console.log(`Failed: ${failed}/${totalProbes}`);
  console.log(`\nRESULT: ${failed === 0 ? 'PASS' : 'FAIL'}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
