const { Pool } = require('pg');
const { SignJWT } = require('jose');
const crypto = require('crypto');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: 'services/gateway/.env' });
const authEnv = dotenv.config({ path: 'services/auth/.env' }).parsed;

const pool = new Pool({
  connectionString: 'postgres://ag_user:ag_password@localhost:5432/ag_ide',
});

const { importPKCS8 } = require('jose');

async function runTests() {
  const authPrivateKeyStr = (authEnv.AUTH_PRIVATE_KEY || process.env.AUTH_PRIVATE_KEY).replace(/\\n/g, '\n');
  const secretKey = await importPKCS8(authPrivateKeyStr, 'ES256');
  
  console.log("Setting up database...");
  
  // Cleanup
  await pool.query('DELETE FROM workspaces');
  await pool.query('DELETE FROM organization_members');
  await pool.query('DELETE FROM organizations');
  await pool.query('DELETE FROM users');

  const userA = crypto.randomUUID();
  const orgA = crypto.randomUUID();
  const workspaceA = crypto.randomUUID();

  const userB = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const workspaceB = crypto.randomUUID();

  // Insert Users
  await pool.query(`INSERT INTO users (id, email, role, status) VALUES ($1, $2, 'USER', 'ACTIVE')`, [userA, 'usera@example.com']);
  await pool.query(`INSERT INTO users (id, email, role, status) VALUES ($1, $2, 'USER', 'ACTIVE')`, [userB, 'userb@example.com']);

  // Insert Orgs
  await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Org A', 'org-a')`, [orgA]);
  await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Org B', 'org-b')`, [orgB]);

  // Insert Members
  await pool.query(`INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'OWNER')`, [orgA, userA]);
  await pool.query(`INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'OWNER')`, [orgB, userB]);

  // Insert Workspaces
  await pool.query(`INSERT INTO workspaces (id, organization_id, created_by, name, git_uri, default_branch, provider, is_private, visibility, status, last_activity_at, created_at, updated_at) VALUES ($1, $2, $3, 'Workspace A', 'git://a', 'main', 'github', true, 'private', 'READY', NOW(), NOW(), NOW())`, [workspaceA, orgA, userA]);
  await pool.query(`INSERT INTO workspaces (id, organization_id, created_by, name, git_uri, default_branch, provider, is_private, visibility, status, last_activity_at, created_at, updated_at) VALUES ($1, $2, $3, 'Workspace B', 'git://b', 'main', 'github', true, 'private', 'READY', NOW(), NOW(), NOW())`, [workspaceB, orgB, userB]);

  console.log("Generating JWT for User A...");
  const tokenA = await new SignJWT({ sub: userA, org_id: orgA })
    .setProtectedHeader({ alg: 'ES256', kid: authEnv.AUTH_KID || 'test-key-v1' })
    .setIssuedAt()
    .setIssuer('https://auth.ag-ide.local')
    .setAudience('ag-ide-platform')
    .setExpirationTime('2h')
    .sign(secretKey);

  console.log("Starting Cross-Tenant Tests...");

  async function fetchRpc(path, payload, headers = {}) {
    const res = await fetch(`http://localhost:8080${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`,
        ...headers
      },
      body: JSON.stringify(payload)
    });
    return res;
  }

  // 1. User A accesses Org A
  let res = await fetchRpc('/organization.v1.OrganizationService/GetOrganization', { id: orgA });
  console.log(`[TEST] User A accesses Org A -> Status: ${res.status}`);

  // 2. User A accesses Org B (Cross-tenant denial)
  res = await fetchRpc('/organization.v1.OrganizationService/GetOrganization', { id: orgB });
  console.log(`[TEST] User A accesses Org B -> Status: ${res.status}`);

  // 3. User A accesses Workspace A
  res = await fetchRpc('/workspace.v1.WorkspaceService/GetWorkspace', { id: workspaceA });
  console.log(`[TEST] User A accesses Workspace A -> Status: ${res.status}`);

  // 4. User A accesses Workspace B (Cross-tenant denial)
  res = await fetchRpc('/workspace.v1.WorkspaceService/GetWorkspace', { id: workspaceB });
  console.log(`[TEST] User A accesses Workspace B -> Status: ${res.status}`);

  // 5. User A spoofs headers to access Workspace B
  res = await fetchRpc('/workspace.v1.WorkspaceService/GetWorkspace', { id: workspaceB }, {
    'x-trusted-user-id': userB,
    'x-organization-id': orgB
  });
  console.log(`[TEST] User A spoofs headers to access Workspace B -> Status: ${res.status}`);

  process.exit(0);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
