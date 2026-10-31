/**
 * ==============================================================================
 * Phase 5.2.3.1 - PostgreSQL Partition Migration Live Execution Proof
 * Automated test suite covering Scenarios A, B, C, Rollback, and Boundaries
 * ==============================================================================
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../infra/database/postgres/migrations');

delete process.env.PGDATABASE;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const PG_HOST = '127.0.0.1';
const PG_PORT = 5432;
const PG_USER = 'ag_user';
const PG_PASSWORD = 'ag_password';
const ROOT_DB = 'ag_ide';

function getClient(database) {
  return new Client({
    connectionString: `postgres://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${database}`
  });
}

async function recreateDatabase(dbName) {
  const rootClient = getClient(ROOT_DB);
  await rootClient.connect();
  try {
    // Terminate existing connections to dbName
    await rootClient.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [dbName]);
    await rootClient.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await rootClient.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await rootClient.end();
  }
}

// Compute CRC32 checksum matching Flyway
function crc32(str) {
  let table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  const buf = Buffer.from(str, 'utf8');
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ -1) | 0;
}

async function applyMigrationsUpTo(client, maxVersion) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS flyway_schema_history (
      installed_rank INT NOT NULL,
      version VARCHAR(50),
      description VARCHAR(200) NOT NULL,
      type VARCHAR(20) NOT NULL,
      script VARCHAR(1000) NOT NULL,
      checksum INT,
      installed_by VARCHAR(100) NOT NULL,
      installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      execution_time INT NOT NULL,
      success BOOLEAN NOT NULL,
      PRIMARY KEY (installed_rank)
    );
  `);

  const files = fs.readdirSync(migrationsDir)
    .filter(f => /^V\d+__.+\.sql$/.test(f))
    .sort((a, b) => {
      const vA = parseInt(a.match(/^V(\d+)/)[1], 10);
      const vB = parseInt(b.match(/^V(\d+)/)[1], 10);
      return vA - vB;
    });

  for (const file of files) {
    const versionNum = parseInt(file.match(/^V(\d+)/)[1], 10);
    if (versionNum > maxVersion) continue;

    const existing = await client.query('SELECT 1 FROM flyway_schema_history WHERE script = $1 AND success = true', [file]);
    if (existing.rows.length > 0) continue;

    const rankRes = await client.query('SELECT COALESCE(MAX(installed_rank), 0) + 1 AS next_rank FROM flyway_schema_history');
    let rank = parseInt(rankRes.rows[0].next_rank, 10);

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const checksum = crc32(sql);
    const desc = file.match(/^V\d+__(.+)\.sql$/)[1].replace(/_/g, ' ');

    const start = Date.now();
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Failed to apply ${file}: ${err.message}`);
    }
    const duration = Date.now() - start;

    await client.query(`
      INSERT INTO flyway_schema_history 
      (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success)
      VALUES ($1, $2, $3, 'SQL', $4, $5, 'test_runner', $6, true)
    `, [rank++, String(versionNum), desc, file, checksum, duration]);
  }
}

async function insertCoreEntities(client) {
  await client.query(`
    INSERT INTO users (id, email) 
    VALUES ('00000000-0000-0000-0000-000000000001', 'tester@example.com')
    ON CONFLICT DO NOTHING;

    INSERT INTO organizations (id, name, slug) 
    VALUES ('a0000000-0000-0000-0000-000000000001', 'Test Tenant', 'test-tenant')
    ON CONFLICT DO NOTHING;

    INSERT INTO workspaces (id, organization_id, created_by, name) 
    VALUES ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Main Workspace')
    ON CONFLICT DO NOTHING;

    INSERT INTO agent_runs (id, workspace_id, goal) 
    VALUES ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Test Run')
    ON CONFLICT DO NOTHING;
  `);
}

async function runScenarioA() {
  console.log('\n--- Scenario A: Clean Upgrade from V0010 ---');
  const dbName = 'test_scenario_a_proof';
  await recreateDatabase(dbName);
  const client = getClient(dbName);
  await client.connect();

  try {
    // 1. Apply up to V0013
    await applyMigrationsUpTo(client, 13);
    await insertCoreEntities(client);

    // 2. Insert representative rows into July and August 2026 partitions
    await client.query(`
      INSERT INTO agent_events (id, run_id, workspace_id, event_type, payload, timestamp) VALUES
      ('11111111-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'JULY_EVENT', '{"test":true}', '2026-07-15 10:00:00+00'),
      ('11111111-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'AUGUST_EVENT', '{"test":true}', '2026-08-20 10:00:00+00');

      INSERT INTO audit_logs (id, organization_id, action, resource_type, resource_id, timestamp) VALUES
      ('22222222-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'JULY_AUDIT', 'workspace', 'b0000000-0000-0000-0000-000000000001', '2026-07-15 10:00:00+00'),
      ('22222222-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'AUGUST_AUDIT', 'workspace', 'b0000000-0000-0000-0000-000000000001', '2026-08-20 10:00:00+00');
    `);

    // 3. Apply V0014
    await applyMigrationsUpTo(client, 14);

    // 4. Verify partition counts and attachment
    const agentParts = await client.query(`
      SELECT pr.relname 
      FROM pg_inherits pi 
      JOIN pg_class pr ON pi.inhrelid = pr.oid 
      WHERE pi.inhparent = 'agent_events'::regclass
      ORDER BY pr.relname;
    `);

    const auditParts = await client.query(`
      SELECT pr.relname 
      FROM pg_inherits pi 
      JOIN pg_class pr ON pi.inhrelid = pr.oid 
      WHERE pi.inhparent = 'audit_logs'::regclass
      ORDER BY pr.relname;
    `);

    // 2 (July, Aug) + 16 (Sep 2026 - Dec 2027) + 1 (default) = 19 partitions total
    if (agentParts.rows.length !== 19) {
      throw new Error(`Expected 19 partitions for agent_events, found ${agentParts.rows.length}`);
    }
    if (auditParts.rows.length !== 19) {
      throw new Error(`Expected 19 partitions for audit_logs, found ${auditParts.rows.length}`);
    }

    // Verify July & Aug rows preserved
    const rowCount = await client.query('SELECT count(*) FROM agent_events');
    if (parseInt(rowCount.rows[0].count, 10) !== 2) {
      throw new Error(`Expected 2 rows in agent_events, found ${rowCount.rows[0].count}`);
    }

    console.log(`[Scenario A PASSED] 19 partitions verified per table. July/August rows preserved.`);
    return { status: 'PASS', partitionCount: agentParts.rows.length, rows: parseInt(rowCount.rows[0].count, 10) };
  } finally {
    await client.end();
  }
}

async function runScenarioB() {
  console.log('\n--- Scenario B: Existing Empty DEFAULT Partition ---');
  const dbName = 'test_scenario_b_proof';
  await recreateDatabase(dbName);
  const client = getClient(dbName);
  await client.connect();

  try {
    // 1. Apply up to V0013
    await applyMigrationsUpTo(client, 13);
    await insertCoreEntities(client);

    // 2. Pre-create empty DEFAULT partitions (simulating legacy/out-of-band state)
    await client.query(`
      CREATE TABLE agent_events_default PARTITION OF agent_events DEFAULT;
      CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;
    `);

    // 3. Apply V0014
    await applyMigrationsUpTo(client, 14);

    // 4. Verify all partitions attached
    const agentParts = await client.query(`
      SELECT pr.relname 
      FROM pg_inherits pi 
      JOIN pg_class pr ON pi.inhrelid = pr.oid 
      WHERE pi.inhparent = 'agent_events'::regclass;
    `);

    if (agentParts.rows.length !== 19) {
      throw new Error(`Expected 19 partitions for agent_events, found ${agentParts.rows.length}`);
    }

    console.log(`[Scenario B PASSED] V0014 attached all range partitions with empty DEFAULT present.`);
    return { status: 'PASS', partitionCount: agentParts.rows.length };
  } finally {
    await client.end();
  }
}

async function runScenarioC() {
  console.log('\n--- Scenario C: Existing DEFAULT Partitions with Overlapping Rows ---');
  const dbName = 'test_scenario_c_proof';
  await recreateDatabase(dbName);
  const client = getClient(dbName);
  await client.connect();

  try {
    // 1. Apply up to V0013
    await applyMigrationsUpTo(client, 13);
    await insertCoreEntities(client);

    // 2. Pre-create DEFAULT partitions
    await client.query(`
      CREATE TABLE agent_events_default PARTITION OF agent_events DEFAULT;
      CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;
    `);

    // 3. Insert 5 uniquely identifiable rows into agent_events and audit_logs:
    // - Row 1: September 2026 (2026-09-15) -> belongs in agent_events_y2026m09
    // - Row 2: October 2026 (2026-10-19) -> belongs in agent_events_y2026m10
    // - Row 3: June 2027 (2027-06-01) -> belongs in agent_events_y2027m06
    // - Row 4: May 2026 (2026-05-15) -> outside monthly range (prior) -> MUST remain in agent_events_default
    // - Row 5: March 2028 (2028-03-20) -> outside monthly range (future) -> MUST remain in agent_events_default

    const testEvents = [
      { id: '33333333-0000-0000-0000-000000000001', ts: '2026-09-15 10:00:00+00', expectedPartition: 'agent_events_y2026m09', tag: 'SEP_2026' },
      { id: '33333333-0000-0000-0000-000000000002', ts: '2026-10-19 14:30:00+00', expectedPartition: 'agent_events_y2026m10', tag: 'OCT_2026' },
      { id: '33333333-0000-0000-0000-000000000003', ts: '2027-06-01 08:00:00+00', expectedPartition: 'agent_events_y2027m06', tag: 'JUN_2027' },
      { id: '33333333-0000-0000-0000-000000000004', ts: '2026-05-15 12:00:00+00', expectedPartition: 'agent_events_default', tag: 'MAY_2026_DEFAULT' },
      { id: '33333333-0000-0000-0000-000000000005', ts: '2028-03-20 16:00:00+00', expectedPartition: 'agent_events_default', tag: 'MAR_2028_DEFAULT' }
    ];

    for (const row of testEvents) {
      await client.query(`
        INSERT INTO agent_events (id, run_id, workspace_id, event_type, payload, timestamp)
        VALUES ($1, 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', $2, '{"key":"val"}', $3)
      `, [row.id, row.tag, row.ts]);

      await client.query(`
        INSERT INTO audit_logs (id, organization_id, action, resource_type, resource_id, timestamp)
        VALUES ($1, 'a0000000-0000-0000-0000-000000000001', $2, 'workspace', 'b0000000-0000-0000-0000-000000000001', $3)
      `, [row.id, row.tag, row.ts]);
    }

    // Verify all 5 rows were initially inserted into default
    const preCount = await client.query('SELECT count(*) FROM agent_events_default');
    if (parseInt(preCount.rows[0].count, 10) !== 5) {
      throw new Error(`Pre-check failed: expected 5 rows in agent_events_default, found ${preCount.rows[0].count}`);
    }

    // 4. Apply V0014
    console.log('Applying V0014 with overlapping rows in DEFAULT partitions...');
    await applyMigrationsUpTo(client, 14);

    // 5. Post-migration verification
    // A. Total rows in agent_events must be exactly 5 (zero loss, zero duplication)
    const postCount = await client.query('SELECT count(*) FROM agent_events');
    if (parseInt(postCount.rows[0].count, 10) !== 5) {
      throw new Error(`Post-check failed: expected exactly 5 rows in agent_events, found ${postCount.rows[0].count}`);
    }

    const postAuditCount = await client.query('SELECT count(*) FROM audit_logs');
    if (parseInt(postAuditCount.rows[0].count, 10) !== 5) {
      throw new Error(`Post-check failed: expected exactly 5 rows in audit_logs, found ${postAuditCount.rows[0].count}`);
    }

    // B. Check exact physical partition for each row using tableoid::regclass
    const verificationResults = [];
    for (const expected of testEvents) {
      const res = await client.query(`
        SELECT id, event_type, timestamp, tableoid::regclass AS physical_table 
        FROM agent_events 
        WHERE id = $1
      `, [expected.id]);

      if (res.rows.length !== 1) {
        throw new Error(`Row ${expected.id} not found or duplicated (count: ${res.rows.length})`);
      }

      const actualPhysical = res.rows[0].physical_table;
      if (actualPhysical !== expected.expectedPartition) {
        throw new Error(`Row ${expected.tag} routed to ${actualPhysical}, expected ${expected.expectedPartition}`);
      }

      verificationResults.push({
        id: expected.id,
        tag: expected.tag,
        ts: expected.ts,
        expectedPartition: expected.expectedPartition,
        actualPartition: actualPhysical,
        status: 'CORRECT'
      });
    }

    // C. Check DEFAULT partition contains exactly the 2 out-of-range rows
    const defRows = await client.query('SELECT count(*) FROM agent_events_default');
    if (parseInt(defRows.rows[0].count, 10) !== 2) {
      throw new Error(`Expected exactly 2 out-of-range rows in agent_events_default, found ${defRows.rows[0].count}`);
    }

    // D. Verify DEFAULT partition remains attached
    const isAttached = await client.query(`
      SELECT 1 FROM pg_inherits 
      WHERE inhrelid = 'agent_events_default'::regclass 
        AND inhparent = 'agent_events'::regclass
    `);
    if (isAttached.rows.length === 0) {
      throw new Error('agent_events_default is not attached to agent_events');
    }

    console.log(`[Scenario C PASSED] All 5 rows migrated with 100% data fidelity:`);
    console.table(verificationResults);
    return { status: 'PASS', verificationResults };
  } finally {
    await client.end();
  }
}

async function runRollbackProof() {
  console.log('\n--- Step 3: Rollback & Recovery Proof ---');
  const dbName = 'test_rollback_proof';
  await recreateDatabase(dbName);
  const client = getClient(dbName);
  await client.connect();

  try {
    await applyMigrationsUpTo(client, 13);
    await insertCoreEntities(client);

    await client.query(`
      CREATE TABLE agent_events_default PARTITION OF agent_events DEFAULT;
      INSERT INTO agent_events (id, run_id, workspace_id, event_type, payload, timestamp) VALUES
      ('44444444-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'TEST_EVENT', '{}', '2026-09-15 12:00:00+00');
    `);

    // Simulate an error inside the migration transaction
    let errorCaught = false;
    await client.query('BEGIN');
    try {
      // Step A: Detach
      await client.query('ALTER TABLE agent_events DETACH PARTITION agent_events_default');
      // Step B: Create partial monthly partition
      await client.query(`CREATE TABLE agent_events_y2026m09 PARTITION OF agent_events FOR VALUES FROM ('2026-09-01') TO ('2026-10-01')`);
      // Step C: Simulated failure midway
      await client.query('SELECT 1 / 0');
      await client.query('COMMIT');
    } catch (err) {
      errorCaught = true;
      await client.query('ROLLBACK');
    }

    if (!errorCaught) {
      throw new Error('Expected simulated failure was not triggered');
    }

    // Verify rollback atomicity:
    // 1. agent_events_default must still be attached
    const isAttached = await client.query(`
      SELECT 1 FROM pg_inherits 
      WHERE inhrelid = 'agent_events_default'::regclass 
        AND inhparent = 'agent_events'::regclass
    `);
    if (isAttached.rows.length === 0) {
      throw new Error('Rollback failure: agent_events_default is not attached');
    }

    // 2. agent_events_y2026m09 must not exist
    const partExists = await client.query(`SELECT to_regclass('agent_events_y2026m09')`);
    if (partExists.rows[0].to_regclass !== null) {
      throw new Error('Rollback failure: agent_events_y2026m09 was not rolled back');
    }

    // 3. Row must still be present in agent_events_default
    const count = await client.query('SELECT count(*) FROM agent_events_default');
    if (parseInt(count.rows[0].count, 10) !== 1) {
      throw new Error(`Rollback failure: row count is ${count.rows[0].count}, expected 1`);
    }

    console.log('[Step 3 PASSED] Transactional DDL & DML atomicity proven: 0 orphaned objects, DEFAULT remained attached, data preserved.');
    return { status: 'PASS', rollbackAtomic: true };
  } finally {
    await client.end();
  }
}

async function runBoundaryProof() {
  console.log('\n--- Step 4: Monthly Half-Open Bounds Proof ---');
  const dbName = 'test_boundary_proof';
  await recreateDatabase(dbName);
  const client = getClient(dbName);
  await client.connect();

  try {
    await applyMigrationsUpTo(client, 14);
    await insertCoreEntities(client);

    const boundaryTests = [
      { ts: '2026-08-31 23:59:59.999999+00', expected: 'agent_events_y2026m08', label: 'August microsecond boundary' },
      { ts: '2026-09-01 00:00:00+00', expected: 'agent_events_y2026m09', label: 'September start boundary' },
      { ts: '2026-09-30 23:59:59.999999+00', expected: 'agent_events_y2026m09', label: 'September microsecond boundary' },
      { ts: '2026-10-01 00:00:00+00', expected: 'agent_events_y2026m10', label: 'October start boundary' },
      { ts: '2027-12-01 00:00:00+00', expected: 'agent_events_y2027m12', label: 'December 2027 start boundary' },
      { ts: '2027-12-31 23:59:59.999999+00', expected: 'agent_events_y2027m12', label: 'December 2027 microsecond boundary' },
      { ts: '2028-01-01 00:00:00+00', expected: 'agent_events_default', label: '2028 start (DEFAULT)' }
    ];

    const results = [];
    for (let i = 0; i < boundaryTests.length; i++) {
      const b = boundaryTests[i];
      const uuid = `55555555-0000-0000-0000-${String(i + 1).padStart(12, '0')}`;
      await client.query(`
        INSERT INTO agent_events (id, run_id, workspace_id, event_type, payload, timestamp)
        VALUES ($1, 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'BOUNDARY_TEST', '{}', $2)
      `, [uuid, b.ts]);

      const res = await client.query('SELECT tableoid::regclass AS target_table FROM agent_events WHERE id = $1', [uuid]);
      const actual = res.rows[0].target_table;
      if (actual !== b.expected) {
        throw new Error(`Boundary test failed for ${b.label} (${b.ts}): expected ${b.expected}, got ${actual}`);
      }

      results.push({
        label: b.label,
        timestamp: b.ts,
        expected: b.expected,
        actual,
        status: 'CORRECT'
      });
    }

    console.log('[Step 4 PASSED] All 7 critical half-open boundary conditions verified:');
    console.table(results);
    return { status: 'PASS', results };
  } finally {
    await client.end();
  }
}

async function cleanupTestDatabases() {
  const rootClient = getClient(ROOT_DB);
  await rootClient.connect();
  const dbs = [
    'test_scenario_a_proof',
    'test_scenario_b_proof',
    'test_scenario_c_proof',
    'test_rollback_proof',
    'test_boundary_proof',
    'test_db_clean_run',
    'test_db_partition_audit'
  ];
  for (const db of dbs) {
    try {
      await rootClient.query(`
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [db]);
      await rootClient.query(`DROP DATABASE IF EXISTS ${db}`);
    } catch (_) {}
  }
  await rootClient.end();
  console.log('\n[Cleanup] All disposable test databases dropped.');
}

async function main() {
  console.log('================================================================');
  console.log('PostgreSQL Partition Migration Live Execution Proof');
  console.log(`Target: PostgreSQL 15.4 @ ${PG_HOST}:${PG_PORT}`);
  console.log('================================================================');

  try {
    await runScenarioA();
    await runScenarioB();
    await runScenarioC();
    await runRollbackProof();
    await runBoundaryProof();
    console.log('\n================================================================');
    console.log('ALL POSTGRESQL RUNTIME PARTITION PROOFS PASSED WITH 100% SUCCESS');
    console.log('================================================================');
  } finally {
    await cleanupTestDatabases();
  }
}

main().catch(err => {
  console.error('\nEXECUTION PROOF FAILED:', err);
  process.exit(1);
});
