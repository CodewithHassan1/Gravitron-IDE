async function testRegistrationE2E() {
  const timestamp = Date.now();
  const testEmail = `hassanhaiderwk+test${timestamp}@gmail.com`;
  console.log('Registering fresh test account:', testEmail);

  const res = await fetch('http://localhost:8080/auth.v1.AuthService/Register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'password123',
      displayName: 'Fresh Test User'
    })
  });

  console.log('Registration HTTP Status:', res.status);
  const data = await res.json();
  console.log('Registration Response Body:', JSON.stringify(data));
}

testRegistrationE2E().catch(console.error);
