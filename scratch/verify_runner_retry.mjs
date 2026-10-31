import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../infra/database/postgres/migrations');

const PG_HOST = '127.0.0.1';
const PG_PORT = 5432;
const PG_USER = 'ag_user';
const PG_PASSWORD = 'ag_password';
const ROOT_DB = 'ag_ide';
const TEST_DB = 'test_runner_retry_db';

async function main() {
  console.log('--- Migration Runner Retry & Recovery Live Audit ---');
  const rootClient = new Client({ connectionString: `postgres://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${ROOT_DB}` });
  await rootClient.connect();
  await rootClient.query(`
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid();
  `);
  await rootClient.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await rootClient.query(`CREATE DATABASE ${TEST_DB}`);
  await rootClient.end();

  const testFile = path.join(migrationsDir, 'V0099__test_retry_migration.sql');

  try {
    // 1. Create a migration that intentionally fails
    fs.writeFileSync(testFile, 'SELECT 1/0;', 'utf8');

    // 2. Run runner (expect failure)
    let failedAsExpected = false;
    try {
      execSync(`node infra/database/postgres/run-migrations.js`, {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          NODE_PATH: path.resolve(__dirname, '../packages/database/node_modules'),
          POSTGRES_URL: `postgres://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${TEST_DB}`
        },
        stdio: 'pipe'
      });
    } catch (err) {
      failedAsExpected = true;
    }

    if (!failedAsExpected) {
      throw new Error('Expected initial migration run to fail, but it succeeded.');
    }

    // 3. Inspect history table
    const client = new Client({ connectionString: `postgres://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${TEST_DB}` });
    await client.connect();

    const historyFail = await client.query('SELECT * FROM flyway_schema_history WHERE script = $1', ['V0099__test_retry_migration.sql']);
    if (historyFail.rows.length !== 1 || historyFail.rows[0].success !== false) {
      throw new Error(`Expected 1 row with success=false, got: ${JSON.stringify(historyFail.rows)}`);
    }
    console.log('[Audit] Initial failure recorded in flyway_schema_history with success = false.');

    // 4. Correct the migration
    fs.writeFileSync(testFile, 'CREATE TABLE test_retry_table (id int);', 'utf8');

    // 5. Re-run migration runner (retry)
    execSync(`node infra/database/postgres/run-migrations.js`, {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        NODE_PATH: path.resolve(__dirname, '../packages/database/node_modules'),
        POSTGRES_URL: `postgres://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${TEST_DB}`
      },
      stdio: 'pipe'
    });

    // 6. Inspect history table after retry
    const historyRetry = await client.query('SELECT * FROM flyway_schema_history WHERE script = $1', ['V0099__test_retry_migration.sql']);
    if (historyRetry.rows.length !== 1) {
      throw new Error(`Expected exactly 1 row (updated in place, no duplicate), got ${historyRetry.rows.length}`);
    }
    if (historyRetry.rows[0].success !== true) {
      throw new Error('Expected row to be updated to success = true');
    }

    console.log('[Audit] Retry succeeded: existing record updated in place to success = true without duplicate history rows.');

    await client.end();
  } finally {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
    const cleanRoot = new Client({ connectionString: `postgres://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${ROOT_DB}` });
    await cleanRoot.connect();
    await cleanRoot.query(`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid();
    `);
    await cleanRoot.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await cleanRoot.end();
    console.log('[Cleanup] Temporary test migration removed and test database dropped.');
  }
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
