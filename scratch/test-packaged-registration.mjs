import { _electron as electron } from '@playwright/test';
import * as path from 'path';

async function run() {
  const exePath = path.resolve('release/win-unpacked/Gravitron IDE.exe');
  console.log('Launching packaged app:', exePath);

  const app = await electron.launch({
    executablePath: exePath,
    args: ['--enable-logging']
  });

  const page = await app.firstWindow();
  console.log('Main window opened. URL:', page.url());

  page.on('console', msg => {
    console.log(`[PAGE CONSOLE] [${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.log(`[PAGE ERROR]`, err);
  });

  page.on('request', req => {
    if (req.url().includes('AuthService')) {
      console.log(`[AUTH REQUEST] ${req.method()} ${req.url()}`);
      console.log('  Headers:', JSON.stringify(req.headers()));
    }
  });

  page.on('response', async res => {
    if (res.url().includes('AuthService')) {
      console.log(`[AUTH RESPONSE] ${res.status()} ${res.url()}`);
      try {
        const body = await res.text();
        console.log('  Body:', body);
      } catch (e) {
        console.log('  Could not read body:', e.message);
      }
    }
  });

  page.on('requestfailed', req => {
    if (req.url().includes('AuthService')) {
      console.log(`[AUTH REQUEST FAILED] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    }
  });

  console.log('Waiting for landing page to settle...');
  await page.waitForLoadState('networkidle');

  console.log('Clicking Login link...');
  await page.click('a[href="/login"]');
  await page.waitForTimeout(1000);

  console.log('Clicking Register link...');
  await page.click('a[href="/register"]');
  await page.waitForTimeout(1000);

  const testEmail = `colleague_test_${Date.now()}@example.com`;
  console.log(`Filling registration form with ${testEmail}...`);
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', 'Password123!');
  await page.fill('input[type="text"]', 'Colleague Test User');

  console.log('Submitting registration...');
  await page.click('button[type="submit"]');

  // Wait for submission response and UI update
  console.log('Waiting for response...');
  await page.waitForTimeout(8000);

  const content = await page.textContent('body');
  console.log('\n--- Page Content Snippet ---');
  console.log(content.substring(0, 500));

  // Check if "Registration Successful" or "Account Created" appears
  if (content.includes('Registration Successful') || content.includes('Account Created')) {
    console.log('\n>>> SUCCESS: Packaged Registration succeeded in UI! <<<');
  } else {
    console.log('\n>>> Registration did not show success in UI <<<');
  }

  await app.close();
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
