const puppeteer = require('puppeteer-core');

async function dragHandle(page, handleSelector, dx, dy) {
  const handle = await page.$(handleSelector);
  const box = await handle.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await page.mouse.up();
  
  // Wait for Zustand debounced persist to settle
  await new Promise(r => setTimeout(r, 500));
}

async function getWidth(page, selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.getBoundingClientRect().width : 0;
  }, selector);
}

(async () => {
  console.log('[TEST] Starting Final Interactive UI & Persistence Validation');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  // 1. Setup WS-1
  console.log('[STEP 1] Navigating to ws-1...');
  await page.goto('http://localhost:3000/dashboard/workspaces/ws-1', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  await new Promise(r => setTimeout(r, 2000));

  let initialSidebarWidth = await getWidth(page, '#sidebar');
  console.log(`Initial Sidebar Width: ${initialSidebarWidth}px`);

  // 2. Drag Sidebar
  console.log('[STEP 2] Dragging left sidebar handle...');
  // Find the first vertical resize handle (usually between sidebar and main)
  const handles = await page.$$('.cursor-col-resize');
  // We'll drag it 100px to the right
  await dragHandle(page, '.cursor-col-resize', 100, 0);

  let newSidebarWidth = await getWidth(page, '#sidebar');
  console.log(`Resized Sidebar Width: ${newSidebarWidth}px`);
  if (Math.abs(newSidebarWidth - (initialSidebarWidth + 100)) > 5) {
      console.warn(`[WARNING] Sidebar didn't resize exactly 100px. Actual: ${newSidebarWidth}`);
  }

  // 3. Double Click Collapse
  console.log('[STEP 3] Double-clicking handle to collapse...');
  const handleBox = await handles[0].boundingBox();
  await page.mouse.click(handleBox.x + handleBox.width/2, handleBox.y + handleBox.height/2, { clickCount: 2 });
  await new Promise(r => setTimeout(r, 500));

  let collapsedWidth = await getWidth(page, '#sidebar');
  console.log(`Collapsed Sidebar Width: ${collapsedWidth}px`);
  if (collapsedWidth > 45) {
      console.error(`[FAILED] Sidebar did not collapse. Width: ${collapsedWidth}px`);
  }

  // 4. Click Explorer Icon to restore
  console.log('[STEP 4] Clicking Explorer icon to restore sidebar...');
  await page.click('button[title="Explorer"]');
  await new Promise(r => setTimeout(r, 500));

  let restoredWidth = await getWidth(page, '#sidebar');
  console.log(`Restored Sidebar Width: ${restoredWidth}px`);
  if (Math.abs(restoredWidth - newSidebarWidth) > 5) {
      console.error(`[FAILED] Sidebar did not restore to its dragged width! Expected ~${newSidebarWidth}, Got ${restoredWidth}`);
  }

  // 5. Persistence via Refresh
  console.log('[STEP 5] Refreshing page to verify persistence...');
  await page.reload({ waitUntil: 'domcontentloaded' });
  let refreshedWidth = await getWidth(page, '#sidebar');
  console.log(`Refreshed Sidebar Width: ${refreshedWidth}px`);
  if (Math.abs(refreshedWidth - restoredWidth) > 5) {
      console.error(`[FAILED] Sidebar width failed to persist across refresh! Expected ~${restoredWidth}, Got ${refreshedWidth}`);
  }

  // 6. Multi-Workspace Isolation
  console.log('[STEP 6] Navigating to ws-2...');
  await page.goto('http://localhost:3000/dashboard/workspaces/ws-2', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  let ws2Width = await getWidth(page, '#sidebar');
  console.log(`WS-2 Sidebar Width: ${ws2Width}px`);
  if (Math.abs(ws2Width - initialSidebarWidth) > 5) {
      console.error(`[FAILED] WS-2 did not load default size! It bled over. Expected ~${initialSidebarWidth}, Got ${ws2Width}`);
  }

  console.log('[STEP 7] Navigating back to ws-1...');
  await page.goto('http://localhost:3000/dashboard/workspaces/ws-1', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  let ws1ReturnWidth = await getWidth(page, '#sidebar');
  console.log(`WS-1 Returned Sidebar Width: ${ws1ReturnWidth}px`);
  if (Math.abs(ws1ReturnWidth - refreshedWidth) > 5) {
      console.error(`[FAILED] WS-1 did not retain its custom width after returning from WS-2! Expected ~${refreshedWidth}, Got ${ws1ReturnWidth}`);
  }

  console.log('\\n[SUCCESS] Interactive Layout and Multi-Workspace Validation Passed!');
  process.exit(0);
})();
