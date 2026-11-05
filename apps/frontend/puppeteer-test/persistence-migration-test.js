const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });

  const page = await browser.newPage();

  // 1. Seed old version 0 local storage on a lightweight 404 page before IDE mounts
  console.log('[TEST] Seeding v0 local storage layout...');
  await page.goto('http://localhost:3000/non-existent-page-404', { waitUntil: 'networkidle0' });

  await page.evaluate(() => {
    localStorage.clear();
    // Legacy state has NO layouts dict and NO currentWorkspaceId
    localStorage.setItem(
      'ide-layout-storage',
      JSON.stringify({
        state: {
          isSidebarOpen: true,
          sidebarSize: 32, // custom old value
          lastSidebarSize: 32,
          activeActivity: 'explorer',
          isSecondarySidebarOpen: false,
          secondarySidebarSize: 20,
          lastSecondarySidebarSize: 20,
          activeSecondaryActivity: 'outline',
          isBottomPanelOpen: true,
          bottomPanelSize: 37, // custom old value
          lastBottomPanelSize: 25,
          bottomPanelActiveTab: 'terminal',
          editorGroupSize: 31,
          layoutMode: 'Default',
          isZenMode: false,
          isMaximizedEditor: false,
          isCenteredLayout: false,
        },
        version: 0,
      })
    );
  });

  // 2. Navigate to a workspace to trigger migration
  console.log('[TEST] Navigating to Workspace to trigger Zustand migration...');
  await page.goto('http://localhost:3000/dashboard/workspaces/ws-legacy-test', {
    waitUntil: 'networkidle0',
  });

  // Wait for React to mount and LayoutManager to apply the layout
  await new Promise((r) => setTimeout(r, 2000));

  // 3. Extract bounds and new localStorage format
  const results = await page.evaluate(() => {
    const sidebar = document.querySelector('#sidebar');
    const bottom = document.querySelector('#bottom-panel');

    const groupWidth = sidebar?.parentElement?.getBoundingClientRect().width || 0;
    const groupHeight = bottom?.parentElement?.getBoundingClientRect().height || 0;

    const sidebarPct =
      sidebar && groupWidth ? (sidebar.getBoundingClientRect().width / groupWidth) * 100 : 0;
    const bottomPct =
      bottom && groupHeight ? (bottom.getBoundingClientRect().height / groupHeight) * 100 : 0;

    const rawStorage = localStorage.getItem('ide-layout-storage');
    const storageObj = JSON.parse(rawStorage || '{}');

    return {
      sidebarPct,
      bottomPct,
      storageObj,
    };
  });

  console.log('[RESULTS] DOM Bounds Post-Migration:', {
    sidebarPct: results.sidebarPct,
    bottomPct: results.bottomPct,
  });

  let hasErrors = false;

  // 4. Assertions on the DOM
  if (Math.abs(results.sidebarPct - 32) > 1) {
    console.error(
      `[FAILED] Legacy sidebarSize (32) did not migrate/hydrate. Actual: ${results.sidebarPct.toFixed(2)}%`
    );
    hasErrors = true;
  }

  if (Math.abs(results.bottomPct - 37) > 1) {
    console.error(
      `[FAILED] Legacy bottomPanelSize (37) did not migrate/hydrate. Actual: ${results.bottomPct.toFixed(2)}%`
    );
    hasErrors = true;
  }

  // 5. Assertions on the storage migration
  const { state, version } = results.storageObj;

  if (version !== 1) {
    console.error(`[FAILED] Store version was not bumped to 1. Actual: ${version}`);
    hasErrors = true;
  }

  if (!state.layouts || !state.layouts['default']) {
    console.error('[FAILED] Legacy state was not migrated into "default" layout slot.');
    hasErrors = true;
  } else if (state.layouts['default'].sidebarSize !== 32) {
    console.error(
      `[FAILED] Legacy sidebarSize wasn't copied to default layout. Actual: ${state.layouts['default'].sidebarSize}`
    );
    hasErrors = true;
  }

  // Since we navigated to 'ws-legacy-test', IDEProvider should have switched to it
  if (state.currentWorkspaceId !== 'ws-legacy-test') {
    console.error(
      `[FAILED] currentWorkspaceId was not updated by IDEProvider. Actual: ${state.currentWorkspaceId}`
    );
    hasErrors = true;
  }

  if (hasErrors) {
    console.error('\n[FAILURE] Migration suite failed.');
    process.exit(1);
  } else {
    console.log(
      '\n[SUCCESS] Migration test passed! Legacy local storage was perfectly retained and upgraded.'
    );
    process.exit(0);
  }
})();
