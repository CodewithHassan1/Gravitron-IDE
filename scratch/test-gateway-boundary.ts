async function testGatewayBoundaries() {
  console.log('--- TEST 1: Protected route without auth header ---');
  const res1 = await fetch('http://localhost:8080/auth.v1.AuthService/IntrospectToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  console.log('Protected route status:', res1.status); // Expect 401
  const body1 = await res1.json();
  console.log('Protected route body:', JSON.stringify(body1));

  console.log('\n--- TEST 2: Similarly prefixed route (/auth.v1.AuthService/VerifyEmailAdmin) ---');
  const res2 = await fetch('http://localhost:8080/auth.v1.AuthService/VerifyEmailAdmin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  console.log('Similarly prefixed route status:', res2.status); // Expect 401
  const body2 = await res2.json();
  console.log('Similarly prefixed route body:', JSON.stringify(body2));

  console.log('\n--- TEST 3: Public /auth.v1.AuthService/VerifyEmail with invalid token (no auth header) ---');
  const res3 = await fetch('http://localhost:8080/auth.v1.AuthService/VerifyEmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'bogus_invalid_token_12345' })
  });
  console.log('VerifyEmail status:', res3.status); // Expect ConnectRPC error (e.g. 400 with invalid_argument code)
  const body3 = await res3.json();
  console.log('VerifyEmail body:', JSON.stringify(body3));
}

testGatewayBoundaries().catch(console.error);
