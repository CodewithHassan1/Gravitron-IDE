import * as pty from 'node-pty';

const ptyProcess = pty.spawn('cmd.exe', [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.cwd(),
  env: process.env as any
});

console.log('Initial process:', ptyProcess.process);

ptyProcess.onData((data) => {
  // console.log(data);
});

setTimeout(() => {
  console.log('Before node:', ptyProcess.process);
  ptyProcess.write('node -e "setTimeout(() => console.log(\'done\'), 2000)"\\r');
  
  setTimeout(() => {
    console.log('During node:', ptyProcess.process);
  }, 1000);

  setTimeout(() => {
    console.log('After node:', ptyProcess.process);
    ptyProcess.kill();
  }, 3000);

}, 1000);
