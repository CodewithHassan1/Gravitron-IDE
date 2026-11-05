import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../services/auth/.env') });

import { validateConfig } from '@ag/config';
import { ProductionMailer, DevelopmentMailer } from '../services/auth/src/services/mailer';

async function main() {
  console.log('Testing Mailer initialization...');
  console.log('SMTP_URL is set:', !!process.env.SMTP_URL);
  console.log('FROM_EMAIL is set:', !!process.env.FROM_EMAIL);

  const config = validateConfig(process.env);
  console.log('config.SMTP_URL is set:', !!config.SMTP_URL);
  console.log('config.FROM_EMAIL is set:', !!config.FROM_EMAIL);

  const mailer = config.SMTP_URL
    ? new ProductionMailer(config.SMTP_URL, config.FROM_EMAIL)
    : new DevelopmentMailer();

  console.log('Mailer class:', mailer.constructor.name);

  // Test sending to the configured FROM_EMAIL (self-send test)
  const testEmail = config.FROM_EMAIL || 'test@example.com';
  console.log('Attempting sendVerificationEmail...');
  try {
    await mailer.sendVerificationEmail(testEmail, 'mock_token_for_test_redacted');
    console.log('sendVerificationEmail succeeded!');
  } catch (err: any) {
    console.error('sendVerificationEmail failed with error:', err.message, err.code, err.response);
  }
}

main().catch(console.error);
