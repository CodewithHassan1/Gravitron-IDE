/**
 * ==============================================================================
 * Gravitron IDE - Production Database Migration Runner
 * Compatible with Flyway schema history format (flyway_schema_history)
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Sanitize connection strings and sensitive info from logs/errors
function sanitize(str) {
  if (typeof str !== 'string') return String(str);
  return str.replace(/:\/\/([^:]+):(.*?)@([a-zA-Z0-9.-]+(?::\d+)?(?:\/|[?#\s]|$))/g, '://$1:***@$3');
}

// Compute CRC32 checksum compatible with Flyway
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

const ADVISORY_LOCK_ID = 2147483647;

async function runMigrations() {
  const rawConnectionString =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    'postgres://ag_user:ag_password@localhost:5432/ag_ide';

  console.log(`[migration-runner] Connecting to database (${sanitize(rawConnectionString)})...`);
  const client = new Client({ connectionString: rawConnectionString });

  await client.connect();
  console.log(`[migration-runner] Connected successfully.`);

  let lockAcquired = false;

  const cleanupSignalHandler = async (signal) => {
    console.warn(`[migration-runner] Received ${signal}. Cleaning up...`);
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
        lockAcquired = false;
      } catch (_) {}
    }
    try {
      await client.end();
    } catch (_) {}
    process.exit(1);
  };

  process.once('SIGINT', cleanupSignalHandler);
  process.once('SIGTERM', cleanupSignalHandler);

  try {
    // Acquire PostgreSQL session advisory lock to prevent concurrent migrations
    console.log(`[migration-runner] Acquiring advisory lock (${ADVISORY_LOCK_ID})...`);
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    lockAcquired = true;
    console.log(`[migration-runner] Advisory lock acquired.`);

    // Initialize Flyway-compatible schema history table
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

    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at: ${migrationsDir}`);
    }

    const allEntries = fs.readdirSync(migrationsDir);
    const files = [];
    const versionMap = new Map();

    for (const entry of allEntries) {
      // Ignore hidden or documentation files
      if (entry.startsWith('.') || entry.endsWith('.md')) {
        continue;
      }

      const match = entry.match(/^V(\d+)__(.+)\.sql$/);
      if (!match) {
        if (entry.startsWith('V') || entry.endsWith('.sql')) {
          throw new Error(
            `Malformed migration filename: "${entry}". Migration files must strictly follow pattern: V<version>__<description>.sql (e.g., V0001__init.sql)`
          );
        }
        continue;
      }

      const versionNum = parseInt(match[1], 10);
      if (versionMap.has(versionNum)) {
        throw new Error(
          `Duplicate migration version detected: Version ${versionNum} is defined in both "${versionMap.get(versionNum)}" and "${entry}".`
        );
      }
      versionMap.set(versionNum, entry);
      files.push({
        filename: entry,
        versionNum,
        version: match[1],
        description: match[2].replace(/_/g, ' ')
      });
    }

    // Deterministic ordering by numerical version
    files.sort((a, b) => a.versionNum - b.versionNum);

    console.log(`[migration-runner] Discovered ${files.length} migration scripts.`);

    // Determine current max rank
    const rankResult = await client.query('SELECT COALESCE(MAX(installed_rank), 0) AS max_rank FROM flyway_schema_history');
    let currentRank = parseInt(rankResult.rows[0].max_rank, 10);

    for (const migration of files) {
      const { filename, version, description } = migration;
      const sqlContent = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      const fileChecksum = crc32(sqlContent);

      const historyResult = await client.query(
        'SELECT * FROM flyway_schema_history WHERE script = $1',
        [filename]
      );

      if (historyResult.rows.length > 0) {
        const row = historyResult.rows[0];
        if (row.success) {
          // Verify checksum against accidental modification
          if (row.checksum !== null && row.checksum !== undefined && row.checksum !== fileChecksum) {
            throw new Error(
              `Checksum mismatch for migration "${filename}": recorded checksum is ${row.checksum}, but current file checksum is ${fileChecksum}. Previously applied migrations must not be modified.`
            );
          }
          console.log(`[migration-runner] [SKIP] ${filename} (already installed on ${row.installed_on ? new Date(row.installed_on).toISOString() : 'earlier'})`);
          continue;
        } else {
          console.warn(`[migration-runner] [RETRY] ${filename} previously failed. Retrying...`);
        }
      }

      console.log(`[migration-runner] [APPLYING] ${filename}...`);
      const startTime = Date.now();

      // Detect statements that cannot execute in a transaction
      const isNonTransactional =
        sqlContent.includes('-- @no-transaction') ||
        /\b(?:CREATE|DROP|REINDEX)\s+INDEX\s+CONCURRENTLY\b/i.test(sqlContent) ||
        /\bVACUUM\b/i.test(sqlContent);

      try {
        if (!isNonTransactional) {
          await client.query('BEGIN');
          await client.query(sqlContent);
          await client.query('COMMIT');
        } else {
          console.log(`[migration-runner] [NON-TRANSACTIONAL] Executing ${filename} without transaction block...`);
          await client.query(sqlContent);
        }
        const durationMs = Date.now() - startTime;

        currentRank += 1;
        if (historyResult.rows.length === 0) {
          await client.query(`
            INSERT INTO flyway_schema_history 
            (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success) 
            VALUES ($1, $2, $3, 'SQL', $4, $5, 'migration_runner', $6, true)
          `, [currentRank, version, description, filename, fileChecksum, durationMs]);
        } else {
          await client.query(`
            UPDATE flyway_schema_history 
            SET success = true, execution_time = $1, checksum = $2, installed_on = CURRENT_TIMESTAMP 
            WHERE script = $3
          `, [durationMs, fileChecksum, filename]);
        }

        console.log(`[migration-runner] [SUCCESS] ${filename} (${durationMs}ms)`);
      } catch (err) {
        if (!isNonTransactional) {
          try {
            await client.query('ROLLBACK');
          } catch (_) {}
        }
        const durationMs = Date.now() - startTime;
        const sanitizedErrMsg = sanitize(err.message);
        console.error(`[migration-runner] [FAILED] ${filename}: ${sanitizedErrMsg}`);

        currentRank += 1;
        if (historyResult.rows.length === 0) {
          await client.query(`
            INSERT INTO flyway_schema_history 
            (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success) 
            VALUES ($1, $2, $3, 'SQL', $4, $5, 'migration_runner', $6, false)
          `, [currentRank, version, description, filename, fileChecksum, durationMs]);
        } else {
          await client.query(`
            UPDATE flyway_schema_history 
            SET success = false, execution_time = $1, checksum = $2, installed_on = CURRENT_TIMESTAMP 
            WHERE script = $3
          `, [durationMs, fileChecksum, filename]);
        }

        throw new Error(`Migration ${filename} failed: ${sanitizedErrMsg}`);
      }
    }

    console.log(`[migration-runner] All migrations successfully processed.`);
  } finally {
    process.removeListener('SIGINT', cleanupSignalHandler);
    process.removeListener('SIGTERM', cleanupSignalHandler);

    if (lockAcquired) {
      try {
        console.log(`[migration-runner] Releasing advisory lock...`);
        await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
        lockAcquired = false;
      } catch (_) {
        // ignore unlock error on disconnect
      }
    }
    await client.end();
  }
}

if (require.main === module) {
  runMigrations().catch(err => {
    console.error(`[migration-runner] Fatal error:`, sanitize(err.message));
    process.exit(1);
  });
}

module.exports = { runMigrations, crc32, sanitize };
