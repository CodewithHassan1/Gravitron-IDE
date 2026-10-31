import { _electron as electron } from '@playwright/test';
import * as path from 'path';

async function forensicTrace() {
  const installedExePath = path.resolve(
    process.env.LOCALAPPDATA,
    'Programs',
    'Gravitron IDE',
    'Gravitron IDE.exe'
  );
  console.log('Target Installed Executable:', installedExePath);

  const traces = {
    requests: [],
    failedRequests: [],
    responses: [],
    consoleLogs: [],
    pageErrors: []
  };

  const app = await electron.launch({
    executablePath: installedExePath,
    args: ['--enable-logging', '--v=1']
  });

  const page = await app.firstWindow();
  console.log('[ELECTRON] First window loaded. Current URL:', page.url());

  page.on('console', msg => {
    const text = msg.text();
    traces.consoleLogs.push({ type: msg.type(), text });
    if (text.includes('Register') || text.includes('Auth') || text.includes('Error') || text.includes('error') || text.includes('fail') || text.includes('gateway')) {
      console.log(`[PAGE CONSOLE ${msg.type()}]`, text);
    }
  });

  page.on('pageerror', err => {
    traces.pageErrors.push(err.message);
    console.log('[PAGE ERROR]', err.message);
  });

  page.on('request', req => {
    const url = req.url();
    const info = {
      method: req.method(),
      url: url,
      resourceType: req.resourceType(),
      headers: req.headers()
    };
    traces.requests.push(info);
    if (url.includes('auth') || url.includes('Auth') || url.includes('8080') || url.includes('3001')) {
      console.log(`[NETWORK REQUEST INITIATED] ${req.method()} ${url}`);
      console.log('  Headers:', JSON.stringify(req.headers()));
    }
  });

  page.on('requestfailed', req => {
    const url = req.url();
    const failure = req.failure();
    traces.failedRequests.push({ url, errorText: failure?.errorText });
    if (url.includes('auth') || url.includes('Auth') || url.includes('8080') || url.includes('3001')) {
      console.log(`[NETWORK REQUEST FAILED] ${req.method()} ${url} -> ${failure?.errorText}`);
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('auth') || url.includes('Auth') || url.includes('8080') || url.includes('3001')) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch (e) {
        bodyText = `<unreadable: ${e.message}>`;
      }
      console.log(`[NETWORK RESPONSE] ${res.status()} ${url}`);
      console.log('  Status Text:', res.statusText());
      console.log('  Response Body (Sanitized):', bodyText.substring(0, 300));
      traces.responses.push({ status: res.status(), url, body: bodyText });
    }
  });

  console.log('Waiting for initial page load...');
  await page.waitForLoadState('networkidle');

  console.log('Navigating to /login...');
  await page.click('a[href="/login"]');
  await page.waitForTimeout(1000);

  console.log('Navigating to /register...');
  await page.click('a[href="/register"]');
  await page.waitForTimeout(1500);

  console.log('Current URL after navigating to register:', page.url());

  const testEmail = `installed_forensic_${Date.now()}@example.com`;
  console.log(`Filling registration form (Email: ${testEmail}, Password: [REDACTED])...`);
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', 'Password123!');
  await page.fill('input[type="text"]', 'Forensic Test User');

  console.log('Clicking Submit button...');
  await page.click('button[type="submit"]');

  console.log('Waiting for registration outcome...');
  await page.waitForTimeout(6000);

  const errorBanner = await page.$('div[role="alert"], .text-red-500, .text-destructive, p.text-sm.text-red-500');
  if (errorBanner) {
    const errorText = await errorBanner.textContent();
    console.log('[UI ERROR DISPLAYED]:', errorText.trim());
  }

  const successHeading = await page.$('text=Registration Successful, text=Account Created, text=Check your email');
  if (successHeading) {
    const text = await successHeading.textContent();
    console.log('[UI SUCCESS DISPLAYED]:', text.trim());
  }

  await app.close();
  console.log('\n--- Trace Summary ---');
  console.log('Total Requests:', traces.requests.length);
  console.log('Auth-related Requests:', traces.requests.filter(r => r.url.includes('Auth') || r.url.includes('auth')));
  console.log('Failed Requests:', traces.failedRequests);
}

forensicTrace().catch(err => {
  console.error('Forensic trace failed:', err);
  process.exit(1);
});
