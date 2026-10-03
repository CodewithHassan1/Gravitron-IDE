const { SignJWT, importPKCS8 } = require('jose');
const http = require('http');

const gatewayPort = 3000;
const privateKeyStr = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQglpNHHdt3BozmXrVF
WbLEeTDUoMMHPCIv0H8nDcIKqw+hRANCAAQgvV7uesOnYrcAc3Ofjo4jmTvMjwyC
wBH8GTyP0a9k8hulB/+TS4l2x59/codIzsuCIUuWBHadLoH38d1icvLx
-----END PRIVATE KEY-----`;

async function request(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: gatewayPort,
        path: path,
        method: 'GET',
        headers: headers,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log("Starting tests...");
  try {
    const key = await importPKCS8(privateKeyStr, 'ES256');
    
    // 1. Valid JWT
    const validJwt = await new SignJWT({ sub: 'user-1', org_id: 'org-1' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key-v1' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .setIssuer('https://auth.ag-ide.local')
      .setAudience('ag-ide-platform')
      .sign(key);
      
    let res = await request('/api/v1/organization/members', { authorization: `Bearer ${validJwt}` });
    console.log(`[TEST] Valid JWT -> Status: ${res.status}`);

    // 2. Expired JWT
    const expiredJwt = await new SignJWT({ sub: 'user-1', org_id: 'org-1' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key-v1' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .setIssuer('https://auth.ag-ide.local')
      .setAudience('ag-ide-platform')
      .sign(key);
    res = await request('/api/v1/organization/members', { authorization: `Bearer ${expiredJwt}` });
    console.log(`[TEST] Expired JWT -> Status: ${res.status}`);
    
    // 3. Wrong Issuer
    const wrongIssuerJwt = await new SignJWT({ sub: 'user-1', org_id: 'org-1' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key-v1' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .setIssuer('https://evil.local')
      .setAudience('ag-ide-platform')
      .sign(key);
    res = await request('/api/v1/organization/members', { authorization: `Bearer ${wrongIssuerJwt}` });
    console.log(`[TEST] Wrong Issuer -> Status: ${res.status}`);

    // 4. Client Cannot Forge Identity
    // Send a valid JWT but try to spoof x-user-id
    res = await request('/api/v1/organization/members', { 
        authorization: `Bearer ${validJwt}`,
        'x-user-id': 'hacker',
        'x-organization-id': 'hacker-org'
    });
    console.log(`[TEST] Spoofed Headers -> Status: ${res.status}`);
    
    // 5. Auth JWKS Endpoint reachable via Gateway?
    res = await request('/api/v1/auth/.well-known/jwks.json');
    console.log(`[TEST] JWKS Reachable -> Status: ${res.status}`);
    
  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

runTests();
