const { Client } = require('pg');
const crypto = require('crypto');

async function seed() {
  const client = new Client({
    connectionString: 'postgres://ag_user:ag_password@localhost:5432/ag_ide',
  });
  await client.connect();

  console.log('Cleaning existing seed data...');
  await client.query('DELETE FROM workspaces');
  await client.query('DELETE FROM organization_members');
  await client.query('DELETE FROM organizations');
  await client.query('DELETE FROM users');

  const users = {
    ownerA: crypto.randomUUID(),
    adminA: crypto.randomUUID(),
    memberA: crypto.randomUUID(),
    viewerA: crypto.randomUUID(),
    ownerB: crypto.randomUUID(),
    memberB: crypto.randomUUID(),
  };

  const orgs = {
    orgA: crypto.randomUUID(),
    orgB: crypto.randomUUID(),
  };

  const workspaces = {
    workspaceA: crypto.randomUUID(),
    workspaceB: crypto.randomUUID(),
  };

  console.log('Inserting users...');
  for (const [key, id] of Object.entries(users)) {
    await client.query(
      `INSERT INTO users (id, email, role, status) VALUES ($1, $2, 'USER', 'ACTIVE')`,
      [id, `${key}@example.com`]
    );
  }

  console.log('Inserting organizations...');
  await client.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Org A', 'org-a')`, [
    orgs.orgA,
  ]);
  await client.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Org B', 'org-b')`, [
    orgs.orgB,
  ]);

  console.log('Inserting members...');
  const members = [
    [orgs.orgA, users.ownerA, 'OWNER'],
    [orgs.orgA, users.adminA, 'ADMIN'],
    [orgs.orgA, users.memberA, 'MEMBER'],
    [orgs.orgA, users.viewerA, 'VIEWER'],
    [orgs.orgB, users.ownerB, 'OWNER'],
    [orgs.orgB, users.memberB, 'MEMBER'],
  ];
  for (const [org, user, role] of members) {
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)`,
      [org, user, role]
    );
  }

  console.log('Inserting workspaces...');
  await client.query(
    `INSERT INTO workspaces (id, organization_id, created_by, name, git_uri, default_branch, provider, is_private, visibility, status, last_activity_at, created_at, updated_at) 
     VALUES ($1, $2, $3, 'Workspace A', 'git://a', 'main', 'github', true, 'private', 'READY', NOW(), NOW(), NOW())`,
    [workspaces.workspaceA, orgs.orgA, users.ownerA]
  );
  await client.query(
    `INSERT INTO workspaces (id, organization_id, created_by, name, git_uri, default_branch, provider, is_private, visibility, status, last_activity_at, created_at, updated_at) 
     VALUES ($1, $2, $3, 'Workspace B', 'git://b', 'main', 'github', true, 'private', 'READY', NOW(), NOW(), NOW())`,
    [workspaces.workspaceB, orgs.orgB, users.ownerB]
  );

  console.log('Seed complete.');
  console.log('============================');
  console.log(JSON.stringify({ users, orgs, workspaces }, null, 2));

  await client.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
