const puppeteer = require('puppeteer-core');

(async () => {
  console.log('[TEST] Starting Runtime Regression Suite...');

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--window-size=1920,1080']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  let errorCount = 0;
  let resizeLoopErrors = 0;

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      if (text.includes('ResizeObserver')) {
        console.error('[FAILED] ResizeObserver error detected:', text);
        resizeLoopErrors++;
        errorCount++;
      } else if (text.includes('404')) {
        // ignore 404s for sourcemaps or fonts in dev mode
      } else {
        console.error('[ERROR]', text);
        errorCount++;
      }
    }
  });

  page.on('pageerror', err => {
    console.error('[PAGE ERROR]', err.toString());
    errorCount++;
  });

  console.log('[TEST 1] Loading Workspace...');
  await page.goto('http://localhost:3000/dashboard/workspaces/ws-1', { waitUntil: 'networkidle0', timeout: 60000 });

  // Wait for IDE to settle
  await new Promise(r => setTimeout(r, 3000));

  // Verify main panels exist by looking at actual content/classes
  const panelsExist = await page.evaluate(() => {
    return {
      activityBar: !!document.querySelector('.w-12'), // ActivityBar
      terminal: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('TERMINAL')),
      editorEmptyScreen: !!document.body.innerText.includes('Gravitron IDE'),
    };
  });

  console.log('[TEST 1 RESULTS] Panels Rendered:', panelsExist);
  const missing = Object.entries(panelsExist).filter(([_, exists]) => !exists);
  if (missing.length > 0) {
    console.error('[FAILED] Missing elements:', missing.map(m => m[0]));
    errorCount++;
  } else {
    console.log('[PASSED] All structural components rendered successfully.');
  }

  // Check for Next.js error overlay (ignore "Static route" info popup)
  const overlayText = await page.evaluate(() => {
    const portal = document.querySelector('nextjs-portal');
    if (!portal || !portal.shadowRoot) return null;
    const text = portal.shadowRoot.textContent || '';
    if (text.includes('Unhandled Runtime Error') || text.match(/\\d+ error/)) return text;
    return null;
  });

  if (overlayText) {
    console.error('[FAILED] Next.js Error Overlay detected:', overlayText.trim().substring(0, 100));
    errorCount++;
  } else {
    console.log('[PASSED] No Next.js runtime error overlay.');
  }

  console.log('[TEST 2] Stress Testing Resizers...');
  // Find resizer handles
  await page.evaluate(async () => {
    const drag = async (element, dx, dy) => {
      const box = element.getBoundingClientRect();
      const startX = box.left + box.width / 2;
      const startY = box.top + box.height / 2;

      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: startX, clientY: startY }));

      for (let i = 1; i <= 5; i++) {
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: startX + (dx * i / 5), clientY: startY + (dy * i / 5) }));
        await new Promise(r => setTimeout(r, 10)); // Yield to layout
      }

      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    };

    const handles = Array.from(document.querySelectorAll('[data-panel-resize-handle-id]'));
    if (handles.length > 0) {
      for (let j = 0; j < 5; j++) {
        for (const handle of handles) {
          const isHorizontal = handle.getAttribute('data-panel-group-direction') === 'horizontal';
          await drag(handle, isHorizontal ? 50 : 0, isHorizontal ? 0 : 50);
          await drag(handle, isHorizontal ? -50 : 0, isHorizontal ? 0 : -50);
        }
      }
    }
  });

  console.log('[PASSED] Stress tested resizer handles.');

  await new Promise(r => setTimeout(r, 2000));

  if (resizeLoopErrors === 0) {
    console.log('[PASSED] No ResizeObserver loops detected after massive drag test.');
  } else {
    console.log(`[FAILED] ${resizeLoopErrors} ResizeObserver errors detected during interactions.`);
  }

  // Performance
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      domInteractive: nav.domInteractive,
      loadEventEnd: nav.loadEventEnd,
    };
  });

  console.log('[PERFORMANCE]', timing);

  await browser.close();

  if (errorCount === 0) {
    console.log('\\n[SUCCESS] Regression suite passed completely!');
  } else {
    console.log(`\\n[FAILURE] Regression suite failed with ${errorCount} errors.`);
  }
})();
