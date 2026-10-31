import { Client } from 'pg';

async function main() {
  const client = new Client({
    connectionString: 'postgres://ag_user:ag_password@localhost:5432/ag_ide'
  });
  await client.connect();
  const res = await client.query('SELECT id, email, role, status, created_at, updated_at FROM users ORDER BY created_at DESC;');
  console.log('Total users count:', res.rows.length);
  console.log('All users:', JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
