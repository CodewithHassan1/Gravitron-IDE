const fs = require('fs');

const privateKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQglpNHHdt3BozmXrVF
WbLEeTDUoMMHPCIv0H8nDcIKqw+hRANCAAQgvV7uesOnYrcAc3Ofjo4jmTvMjwyC
wBH8GTyP0a9k8hulB/+TS4l2x59/codIzsuCIUuWBHadLoH38d1icvLx
-----END PRIVATE KEY-----`;

const publicKey = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIL1e7nrDp2K3AHNzn46OI5k7zI8M
gsAR/Bk8j9GvZPIbpQf/k0uJdseff3KHSM7LgiFLlgR2nS6B9/HdYnLy8Q==
-----END PUBLIC KEY-----`;

const services = ['gateway', 'auth', 'organization', 'workspace', 'worker-ai'];

let port = 3000;
for (const s of services) {
  let example = 'PORT=' + port + '\n';
  let env = 'PORT=' + port + '\n';

  // Common DB
  example += 'POSTGRES_URL=postgres://ag_user:ag_password@localhost:5432/ag_ide\n';
  env += 'POSTGRES_URL=postgres://ag_user:ag_password@localhost:5432/ag_ide\n';
  example += 'REDIS_URL=redis://localhost:6379\n';
  env += 'REDIS_URL=redis://localhost:6379\n';

  env += 'JWT_SECRET=supersecret_32_characters_long_string_123456\n';
  example += 'JWT_SECRET=placeholder_32_chars_min\\n';

  if (s === 'auth') {
    example += 'AUTH_PRIVATE_KEY=\\n';
    example += 'AUTH_KID=test-key-v1\\n';

    env += 'AUTH_PRIVATE_KEY="' + privateKey.replace(/\n/g, '\\n') + '"\n';
    env += 'AUTH_KID=test-key-v1\n';
  } else if (s === 'gateway') {
    example += 'GATEWAY_PRIVATE_KEY=\\n';
    env += 'GATEWAY_PRIVATE_KEY="' + privateKey.replace(/\n/g, '\\n') + '"\n';
    example += 'INTERNAL_PUBLIC_KEY=\\n';
    env += 'INTERNAL_PUBLIC_KEY="' + publicKey.replace(/\n/g, '\\n') + '"\n';
  } else {
    example += 'INTERNAL_PUBLIC_KEY=\\n';
    env += 'INTERNAL_PUBLIC_KEY="' + publicKey.replace(/\n/g, '\\n') + '"\n';
  }

  // gateway needs to know downstream URLs!
  if (s === 'gateway') {
    env += 'AUTH_SERVICE_URL=http://localhost:3001\n'; // wait, auth is 3001
    env += 'ORGANIZATION_SERVICE_URL=http://localhost:3002\n';
    env += 'WORKSPACE_SERVICE_URL=http://localhost:3003\n';
    env += 'WORKER_AI_SERVICE_URL=http://localhost:3004\n';
  }

  fs.writeFileSync('./services/' + s + '/.env.example', example);
  fs.writeFileSync('./services/' + s + '/.env', env);
  port++;
}
console.log('done');
