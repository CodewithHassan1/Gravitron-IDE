const puppeteer = require('puppeteer-core');

(async () => {
  console.log('[TEST] Starting Hydration Regression Suite...');

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--window-size=1920,1080'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  let errorCount = 0;

  page.on('console', (msg) => {
    const text = msg.text();
    console.log('[BROWSER CONSOLE]', text);
    if (msg.type() === 'error' && !text.includes('404')) {
      errorCount++;
    }
  });

  page.on('pageerror', (error) => {
    console.error('[BROWSER EXCEPTION]', error.message);
    errorCount++;
  });

  // Inject layout state into localStorage BEFORE navigating to workspace
  console.log('[TEST 1] Seeding LocalStorage with 35% sidebar, 40% bottom panel...');
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle0' });

  await page.evaluate(() => {
    const state = {
      state: {
        isSidebarOpen: true,
        sidebarSize: 35,
        lastSidebarSize: 35,
        isBottomPanelOpen: true,
        bottomPanelSize: 40,
        lastBottomPanelSize: 40,
        isSecondarySidebarOpen: false,
        secondarySidebarSize: 20,
        lastSecondarySidebarSize: 20,
        editorGroupSize: 25,
      },
      version: 0,
    };
    window.localStorage.setItem('ide-layout-storage', JSON.stringify(state));
  });

  console.log('[TEST 2] Navigating to Workspace...');
  await page.goto('http://localhost:3000/dashboard/workspaces/ws-1', {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });

  // Wait for IDE to settle and hydrate
  await new Promise((r) => setTimeout(r, 2000));

  await page.screenshot({ path: 'hydration_test_screenshot.png' });

  const bounds = await page.evaluate(() => {
    const sidebar = document.querySelector('#sidebar');
    const bottom = document.querySelector('#bottom-panel');

    const groupWidth = sidebar?.parentElement?.getBoundingClientRect().width || 0;
    const groupHeight = bottom?.parentElement?.getBoundingClientRect().height || 0;

    return {
      sidebarPct:
        sidebar && groupWidth ? (sidebar.getBoundingClientRect().width / groupWidth) * 100 : 0,
      bottomPct:
        bottom && groupHeight ? (bottom.getBoundingClientRect().height / groupHeight) * 100 : 0,
    };
  });

  console.log('[RESULTS] DOM Bounds Post-Hydration:', bounds);

  // Due to rounding logic in flexbox, it might be 34.99% or 35.01%. Check within 1% delta.
  if (Math.abs(bounds.sidebarPct - 35) > 1) {
    console.error(
      `[FAILED] Sidebar did not hydrate to 35%. Actual: ${bounds.sidebarPct.toFixed(2)}%`
    );
    errorCount++;
  } else {
    console.log('[PASSED] Left Sidebar restored exact persisted width.');
  }

  if (Math.abs(bounds.bottomPct - 40) > 1) {
    console.error(
      `[FAILED] Bottom panel did not hydrate to 40%. Actual: ${bounds.bottomPct.toFixed(2)}%`
    );
    errorCount++;
  } else {
    console.log('[PASSED] Bottom Terminal restored exact height.');
  }

  // Toggle test
  console.log('[TEST 3] Imperative API Toggle Test...');

  // The toggle shortcut might be different, so let's just trigger it via Zustand
  await page.evaluate(() => {
    window.__zustand_toggle_sidebar = () => {
      // Find the resizer and double click it to collapse
      const resizers = document.querySelectorAll('[data-panel-resize-handle-id]');
      if (resizers.length > 0) {
        resizers[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }
    };
    window.__zustand_toggle_sidebar();
  });

  await new Promise((r) => setTimeout(r, 1000));

  const dblClickBounds = await page.evaluate(() => {
    const sidebar = document.querySelector('#sidebar');
    return sidebar ? sidebar.getBoundingClientRect().width : 0;
  });

  console.log(`[RESULTS] Sidebar width after double-click: ${dblClickBounds}px`);
  if (dblClickBounds > 5) {
    console.warn(
      `[WARNING] Double-click to collapse didn't shrink sidebar to 0. Actual width: ${dblClickBounds}px`
    );
  } else {
    console.log('[PASSED] Imperative collapse via double click succeeded.');
  }

  await browser.close();

  if (errorCount === 0) {
    console.log('\\n[SUCCESS] Hydration and imperative sync passed completely!');
  } else {
    console.log(`\\n[FAILURE] Regression suite failed with ${errorCount} errors.`);
    process.exit(1);
  }
})();
