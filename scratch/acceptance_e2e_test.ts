import { Client } from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';

const GATEWAY_URL = 'http://localhost:8080';
const FRONTEND_URL = 'http://localhost:3000';

async function main() {
  console.log('=== Gravitron IDE Auth Verification Acceptance Test ===\n');

  const pgClient = new Client({
    connectionString: 'postgres://ag_user:ag_password@localhost:5432/ag_ide'
  });
  await pgClient.connect();
  const redis = new Redis('redis://localhost:6379');

  const timestamp = Date.now();
  const testEmail = `hassanhaiderwk+acceptance_${timestamp}@gmail.com`;
  const password = 'Password123!';
  const displayName = 'Acceptance User';

  // -------------------------------------------------------------
  // STEP 1: Registration with a fresh account
  // -------------------------------------------------------------
  console.log(`[Step 1] Registering fresh user: ${testEmail}`);
  const regRes = await fetch(`${GATEWAY_URL}/auth.v1.AuthService/Register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password, displayName })
  });

  console.log(`  Registration HTTP status: ${regRes.status}`);
  const regBody = await regRes.json();
  console.log(`  Registration RPC response:`, JSON.stringify(regBody));
  
  if (regRes.status !== 200 || regBody.status !== 'PENDING_VERIFICATION') {
    throw new Error(`Registration failed or email was not sent automatically! Got status: ${regBody.status}`);
  }
  const userId = regBody.userId;
  console.log(`  Registration succeeded. User ID: ${userId}`);

  // -------------------------------------------------------------
  // STEP 2: Database Status Check (Immediately After Registration)
  // -------------------------------------------------------------
  console.log('\n[Step 2] Verifying initial user status in Postgres');
  const userCheck1 = await pgClient.query('SELECT id, email, status FROM users WHERE id = $1', [userId]);
  console.log('  Database record:', userCheck1.rows[0]);
  if (userCheck1.rows[0]?.status !== 'PENDING_VERIFICATION') {
    throw new Error(`Expected status PENDING_VERIFICATION, got ${userCheck1.rows[0]?.status}`);
  }

  // -------------------------------------------------------------
  // STEP 3: Redis Token Verification
  // -------------------------------------------------------------
  console.log('\n[Step 3] Checking verification token in Redis');
  const verifyKeys = await redis.keys('verify:*');
  let userTokenHash = null;
  for (const k of verifyKeys) {
    const val = await redis.get(k);
    if (val === userId) {
      userTokenHash = k.replace('verify:', '');
      break;
    }
  }
  console.log(`  Found Redis verification token hash for user: ${userTokenHash ? 'YES' : 'NO'}`);
  if (!userTokenHash) {
    throw new Error('Verification token not found in Redis for new user!');
  }

  // -------------------------------------------------------------
  // STEP 4: Frontend Page Load Check
  // -------------------------------------------------------------
  console.log('\n[Step 4] Checking Frontend /verify-email HTTP GET response');
  const feRes = await fetch(`${FRONTEND_URL}/verify-email?token=mock_sample_token`);
  console.log(`  Frontend HTTP status: ${feRes.status}`);
  if (feRes.status !== 200) {
    throw new Error(`Frontend /verify-email failed to return 200, got ${feRes.status}`);
  }

  // -------------------------------------------------------------
  // STEP 5: Verification Attempt via Gateway with Invalid Token
  // -------------------------------------------------------------
  console.log('\n[Step 5] Calling VerifyEmail with invalid token (unauthenticated)');
  const invalidRes = await fetch(`${GATEWAY_URL}/auth.v1.AuthService/VerifyEmail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'completely_invalid_token' })
  });
  console.log(`  Invalid token HTTP status: ${invalidRes.status}`);
  const invalidBody = await invalidRes.json();
  console.log('  Invalid token error response:', JSON.stringify(invalidBody));
  if (invalidRes.status !== 400 || invalidBody.code !== 'invalid_argument') {
    throw new Error('Expected invalid_argument error for invalid token!');
  }

  // -------------------------------------------------------------
  // STEP 6: Execute Valid Verification (simulating clicking email link)
  // We simulate the token verification by creating a known raw token in Redis
  // -------------------------------------------------------------
  console.log('\n[Step 6] Verifying user with valid verification token (unauthenticated)');
  const testRawToken = crypto.randomBytes(32).toString('hex');
  const testHash = crypto.createHash('sha256').update(testRawToken).digest('hex');
  await redis.set(`verify:${testHash}`, userId, 'EX', 3600);

  const verifyRes = await fetch(`${GATEWAY_URL}/auth.v1.AuthService/VerifyEmail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: testRawToken })
  });
  console.log(`  VerifyEmail HTTP status: ${verifyRes.status}`);
  const verifyBody = await verifyRes.json();
  console.log('  VerifyEmail RPC response:', JSON.stringify(verifyBody));
  if (verifyRes.status !== 200) {
    throw new Error(`VerifyEmail failed! Status: ${verifyRes.status}, Body: ${JSON.stringify(verifyBody)}`);
  }

  // -------------------------------------------------------------
  // STEP 7: Verify Database Status Changed to ACTIVE
  // -------------------------------------------------------------
  console.log('\n[Step 7] Checking user status in database after verification');
  const userCheck2 = await pgClient.query('SELECT id, email, status, updated_at FROM users WHERE id = $1', [userId]);
  console.log('  Updated database record:', userCheck2.rows[0]);
  if (userCheck2.rows[0]?.status !== 'ACTIVE') {
    throw new Error(`User status did not transition to ACTIVE! Current status: ${userCheck2.rows[0]?.status}`);
  }

  // -------------------------------------------------------------
  // STEP 8: Single-Use & Replay Protection Check
  // -------------------------------------------------------------
  console.log('\n[Step 8] Re-verifying with the same token (replay attack check)');
  const replayRes = await fetch(`${GATEWAY_URL}/auth.v1.AuthService/VerifyEmail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: testRawToken })
  });
  console.log(`  Replay HTTP status: ${replayRes.status}`);
  const replayBody = await replayRes.json();
  console.log('  Replay error response:', JSON.stringify(replayBody));
  if (replayRes.status !== 400 || replayBody.code !== 'invalid_argument') {
    throw new Error('Expected replay attempt to be rejected with invalid_argument!');
  }

  // -------------------------------------------------------------
  // STEP 9: Login with Activated Account
  // -------------------------------------------------------------
  console.log('\n[Step 9] Logging in with the newly verified user');
  const loginRes = await fetch(`${GATEWAY_URL}/auth.v1.AuthService/PasswordLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password })
  });
  console.log(`  Login HTTP status: ${loginRes.status}`);
  const loginBody = await loginRes.json();
  console.log('  Login response status claim:', loginBody.status);
  console.log('  Has access token:', !!loginBody.accessToken);
  if (loginBody.status !== 'ACTIVE') {
    throw new Error(`Expected login status ACTIVE, got ${loginBody.status}`);
  }

  // -------------------------------------------------------------
  // STEP 10: Verify Gateway Security Boundaries on Protected Routes
  // -------------------------------------------------------------
  console.log('\n[Step 10] Confirming protected Gateway endpoints still require authentication');
  const protRes = await fetch(`${GATEWAY_URL}/auth.v1.AuthService/IntrospectToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  console.log(`  Unauthenticated protected route status: ${protRes.status}`);
  if (protRes.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated protected route, got ${protRes.status}`);
  }

  const prefixRes = await fetch(`${GATEWAY_URL}/auth.v1.AuthService/VerifyEmailMaliciousBypass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  console.log(`  Prefix spoof route status: ${prefixRes.status}`);
  if (prefixRes.status !== 401) {
    throw new Error(`Expected 401 for prefixed route, got ${prefixRes.status}`);
  }

  console.log('\n======================================================');
  console.log('ALL ACCEPTANCE VERIFICATION STEPS PASSED SUCCESSFULLY!');
  console.log('======================================================');

  await pgClient.end();
  await redis.quit();
}

main().catch((err) => {
  console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
