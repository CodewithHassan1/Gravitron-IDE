import { LocalBackend } from './src/services/terminal/pty/LocalBackend';
import { ExecutionContext } from '@ag/protocol';
import * as pty from 'node-pty';

async function testShell(executable: string, args: string[], cmds: string[], expectedPatterns: RegExp[]) {
  console.log(`\n=== Testing ${executable} ===`);
  const backend = new LocalBackend();
  const sessionId = 'test-' + Date.now();
  
  const ctx: ExecutionContext = {
    shell: { executable, args },
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    environment: process.env,
    target: { kind: 'local' },
    executionProfileId: 'test'
  };

  const pid = await backend.createProcess(sessionId, ctx);
  const adapter = backend.getProcess(pid);
  
  if (!adapter) throw new Error('Process not found');

  let output = '';
  adapter.onData(data => {
    output += data;
  });

  await new Promise(r => setTimeout(r, 1000));

  for (const cmd of cmds) {
    console.log(`Sending: ${cmd}`);
    adapter.write(cmd + '\r');
    await new Promise(r => setTimeout(r, 1500));
  }

  backend.dispose();

  let allPassed = true;
  for (const pattern of expectedPatterns) {
    if (pattern.test(output)) {
      console.log(`✅ Found expected pattern: ${pattern}`);
    } else {
      console.log(`❌ Missing expected pattern: ${pattern}`);
      console.log('Got output:', JSON.stringify(output));
      allPassed = false;
    }
  }
  return allPassed;
}

async function runTests() {
  let success = true;
  
  // 1. PowerShell
  const psPassed = await testShell(
    'powershell.exe',
    [],
    ['Set-Location ..', 'node -e "setTimeout(() => console.log(\'done\'), 500)"'],
    [
      /\\x1b\]7;file:\/\/localhost\/.*?\\x07/, // initial OSC 7
      /\\x1b\]0;PowerShell\\x07/, // initial OSC 0
      /\\x1b\]0;node\\x07/ // active command OSC 0
    ]
  );
  if (!psPassed) success = false;

  // 2. CMD
  const cmdPassed = await testShell(
    'cmd.exe',
    [],
    ['cd ..'],
    [
      /\\x1b\]7;file:\/\/localhost\/.*?\\x07/, // CWD
      /\\x1b\]0;Command Prompt\\x07/ // Title
    ]
  );
  if (!cmdPassed) success = false;

  // 3. Git Bash (if installed)
  try {
    const bashPassed = await testShell(
      'C:\\Program Files\\Git\\bin\\bash.exe',
      ['-l'],
      ['cd ..', 'sleep 1'],
      [
        /\\x1b\]7;file:\/\/localhost.*?\\x07/, // CWD
        /\\x1b\]0;bash\\x07/, // Idle title
        /\\x1b\]0;sleep\\x07/ // Active title
      ]
    );
    if (!bashPassed) success = false;
  } catch (e) {
    console.log('Skipping Git Bash test, not found at default location.');
  }

  if (success) {
    console.log('\n✅ ALL INTEGRATION TESTS PASSED!');
  } else {
    console.log('\n❌ SOME INTEGRATION TESTS FAILED.');
  }
}

runTests().catch(console.error);
