const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function runMigrations() {
  const client = new Client({
    connectionString: 'postgres://ag_user:ag_password@localhost:5432/ag_ide',
  });

  await client.connect();
  console.log('Connected to database.');

  // Create migrations table if not exists
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

  const migrationsDir = path.join(__dirname, '../infra/database/postgres/migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.endsWith('.sql')) continue;

    const res = await client.query('SELECT * FROM flyway_schema_history WHERE script = $1', [file]);
    if (res.rows.length > 0 && res.rows[0].success) {
      console.log(`Skipping already applied migration: ${file}`);
      continue;
    }

    console.log(`Applying migration: ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    const start = Date.now();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      const time = Date.now() - start;

      const rank = i + 1;
      const version = file.split('__')[0].replace('V', '');
      const description = file.split('__')[1].replace('.sql', '').replace(/_/g, ' ');

      if (res.rows.length === 0) {
        await client.query(
          `
          INSERT INTO flyway_schema_history 
          (installed_rank, version, description, type, script, installed_by, execution_time, success) 
          VALUES ($1, $2, $3, 'SQL', $4, 'node_script', $5, true)
        `,
          [rank, version, description, file, time]
        );
      } else {
        await client.query(`UPDATE flyway_schema_history SET success = true WHERE script = $1`, [
          file,
        ]);
      }
      console.log(`Successfully applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Error applying migration ${file}:`, err.message);

      const rank = i + 1;
      const version = file.split('__')[0].replace('V', '');
      const description = file.split('__')[1].replace('.sql', '').replace(/_/g, ' ');

      if (res.rows.length === 0) {
        await client.query(
          `
          INSERT INTO flyway_schema_history 
          (installed_rank, version, description, type, script, installed_by, execution_time, success) 
          VALUES ($1, $2, $3, 'SQL', $4, 'node_script', $5, false)
        `,
          [rank, version, description, file, Date.now() - start]
        );
      }
      process.exit(1);
    }
  }

  console.log('All migrations applied.');
  await client.end();
}

runMigrations().catch((err) => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
