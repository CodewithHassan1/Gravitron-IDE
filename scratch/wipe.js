const { Client } = require('pg');

async function wipe() {
  const client = new Client({
    connectionString: 'postgres://ag_user:ag_password@localhost:5432/ag_ide'
  });
  await client.connect();
  console.log("Wiping schema...");
  await client.query('DROP SCHEMA public CASCADE;');
  await client.query('CREATE SCHEMA public;');
  console.log("Wiped.");
  await client.end();
}

wipe().catch(err => {
  console.error(err);
  process.exit(1);
});
