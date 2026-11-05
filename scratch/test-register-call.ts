import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../services/auth/.env') });

import setupRouter from '../services/auth/src/server';
import { AuthService } from '@ag/proto/gen/ts/auth/v1/auth_connect';

async function main() {
  let registerHandler: any;
  const mockRouter: any = {
    rpc: (_service: any, method: any, handler: any) => {
      if (method.name === 'Register') {
        registerHandler = handler;
      }
    },
  };

  setupRouter(mockRouter);

  const testEmail = `test_auto_${Date.now()}@gmail.com`;
  console.log('Invoking register with test email:', testEmail);
  try {
    const res = await registerHandler(
      {
        email: testEmail,
        password: 'password123',
        displayName: 'Test Auto',
      },
      {}
    );
    console.log('Register response:', JSON.stringify(res));
  } catch (err: any) {
    console.error('Register failed:', err);
  }
}

main().catch(console.error);
