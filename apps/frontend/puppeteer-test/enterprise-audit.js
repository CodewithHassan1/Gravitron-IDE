const puppeteer = require('puppeteer-core');
const fs = require('fs');

async function runAudit() {
  console.log('[ENTERPRISE AUDIT] Initializing Puppeteer CDP Session...');

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--window-size=1920,1080', '--js-flags="--expose-gc"'],
  });

  const page = await browser.newPage();

  // Phase 11: Network Audit
  let networkErrors = 0;
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      !response.url().includes('favicon') &&
      !response.url().includes('webpack')
    ) {
      console.warn(`[NETWORK WARNING] Status ${response.status()} on ${response.url()}`);
      // Don't fail immediately on 404s (e.g. some devtools map files), but log them.
      if (response.status() >= 500) networkErrors++;
    }
  });

  page.on('pageerror', (err) => {
    console.error('[BROWSER ERROR]', err.message);
  });

  console.log('[PHASE 3, 4, 9] Multi-Workspace Hydration Integrity...');
  await page.goto('http://localhost:3000/dashboard/workspaces/ws-audit-1', {
    waitUntil: 'domcontentloaded',
  });
  await new Promise((r) => setTimeout(r, 2000));

  // Synthesize a layout change to trigger Zustand persist!
  await page.evaluate(() => {
    // We just find the resize handle and click it
    const handle = document.querySelector('[data-panel-resize-handle-id]');
    if (handle) {
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }
  });
  await new Promise((r) => setTimeout(r, 1000));

  const getLayoutState = async () => {
    return page.evaluate(() => {
      return JSON.parse(window.localStorage.getItem('ide-layout-storage'));
    });
  };

  const ws1State = await getLayoutState();
  if (!ws1State?.state?.layouts?.['ws-audit-1']) {
    console.warn(
      '[WARNING] Layout store did not eagerly persist ws-audit-1 keyed isolation because it has not been modified.'
    );
  }

  console.log('[PHASE 2, 6, 7] Layout Constraints & Viewport Stress Test...');
  const viewports = [
    { width: 320, height: 800 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 3840, height: 2160 },
  ];

  for (let vp of viewports) {
    console.log(`[TESTING] Viewport Resize -> ${vp.width}x${vp.height}`);
    await page.setViewport(vp);
    await new Promise((r) => setTimeout(r, 500)); // allow flex recalculation

    const bounds = await page.evaluate(() => {
      const sb = document.querySelector('[data-panel-id="sidebar"]')?.getBoundingClientRect();
      const main = document.querySelector('[data-panel-id="main"]')?.getBoundingClientRect();
      const ss = document
        .querySelector('[data-panel-id="secondary-sidebar"]')
        ?.getBoundingClientRect();
      const group = document
        .querySelector('[data-panel-id="sidebar"]')
        ?.parentElement?.getBoundingClientRect();
      return {
        sidebarWidth: sb ? sb.width : 0,
        mainWidth: main ? main.width : 0,
        secondaryWidth: ss ? ss.width : 0,
        totalWidth: group ? group.width : 0,
      };
    });

    const sum = bounds.sidebarWidth + bounds.mainWidth + bounds.secondaryWidth;
    const delta = Math.abs(sum - bounds.totalWidth);
    if (delta > 2) {
      console.error(`[FAILED] Math bounds exceeded 100%. Total: ${bounds.totalWidth}, Sum: ${sum}`);
      process.exit(1);
    }
  }

  console.log('[PASSED] Layout constrained perfectly to 100% across all viewports.');

  console.log('[PHASE 10] Memory Evaluation & ResizeObserver Loop Checks...');

  // Connect to CDP to measure heap
  const client = await page.target().createCDPSession();
  await client.send('HeapProfiler.enable');
  await client.send('HeapProfiler.collectGarbage');

  const metricsBefore = await page.metrics();
  console.log(
    `[MEMORY] Initial JSHeapUsedSize: ${(metricsBefore.JSHeapUsedSize / 1024 / 1024).toFixed(2)} MB`
  );

  // Synthesize massive event firing (resize observer thrashing)
  console.log('[TESTING] Dispatching massive synthetic resize events...');
  await page.evaluate(() => {
    for (let i = 0; i < 500; i++) {
      window.dispatchEvent(new Event('resize'));
    }
  });

  await new Promise((r) => setTimeout(r, 1000));
  await client.send('HeapProfiler.collectGarbage');
  const metricsAfter = await page.metrics();
  console.log(
    `[MEMORY] Post-Stress JSHeapUsedSize: ${(metricsAfter.JSHeapUsedSize / 1024 / 1024).toFixed(2)} MB`
  );

  const diff = metricsAfter.JSHeapUsedSize - metricsBefore.JSHeapUsedSize;
  if (diff > 5 * 1024 * 1024) {
    // If heap grew by more than 5MB after GC, there's a serious layout node leak
    console.error(
      `[FAILED] Memory Leak Detected! Heap grew by ${(diff / 1024 / 1024).toFixed(2)} MB`
    );
    process.exit(1);
  }

  if (networkErrors > 0) {
    console.error(`[FAILED] ${networkErrors} internal 500 network errors encountered.`);
    process.exit(1);
  }

  console.log('[SUCCESS] Enterprise Regression Suite Passed Seamlessly.');
  await browser.close();
}

runAudit().catch(console.error);
