import * as pty from 'node-pty';

async function testTitle(shell: string, cmd: string) {
  console.log(`\n--- Testing Title in ${shell} ---`);
  const p = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: process.env as any
  });

  p.onData(data => {
    // Check for OSC 0 title sequence: ESC ] 0 ; TITLE BEL
    const match = data.match(/\\x1b\\]0;(.*?)\\x07/);
    if (match) {
      console.log(`[OSC 0] Title changed to: "${match[1]}"`);
    }
  });

  await new Promise(r => setTimeout(r, 1000));
  console.log('Sending command:', cmd);
  p.write(cmd + '\r');
  await new Promise(r => setTimeout(r, 4000)); // wait for command to run and finish
  
  p.kill();
}

async function run() {
  await testTitle('powershell.exe', 'node -e "setTimeout(() => console.log(\'done\'), 2000)"');
  await testTitle('cmd.exe', 'node -e "setTimeout(() => console.log(\'done\'), 2000)"');
}

run().catch(console.error);
