import * as pty from 'node-pty';

async function testShell(shell: string, args: string[], cmd: string) {
  console.log(`\n--- Testing ${shell} ---`);
  const p = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: process.env as any
  });

  let out = '';
  p.onData(data => {
    out += data;
    // Log any OSC sequences
    if (data.includes('\x1b]')) {
      console.log(`OSC sequence detected in ${shell}:`, JSON.stringify(data));
    }
  });

  await new Promise(r => setTimeout(r, 1000));
  console.log('Sending command:', cmd);
  p.write(cmd + '\r');
  await new Promise(r => setTimeout(r, 1000));
  
  p.kill();
  console.log(`Output length: ${out.length}`);
}

async function run() {
  await testShell('powershell.exe', [], 'cd ..');
  await testShell('cmd.exe', [], 'cd ..');
  await testShell('C:\\Users\\Hassan Haider Chotu\\AppData\\Local\\Programs\\Git\\bin\\bash.exe', [], 'cd ..');
}

run().catch(console.error);
