'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
var pty = require('node-pty');
var ptyProcess = pty.spawn('cmd.exe', [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.cwd(),
  env: process.env,
});
console.log('Initial process:', ptyProcess.process);
ptyProcess.onData(function (data) {
  // console.log(data);
});
setTimeout(function () {
  console.log('Before node:', ptyProcess.process);
  ptyProcess.write('node -e "setTimeout(() => console.log(\'done\'), 2000)"\\r');
  setTimeout(function () {
    console.log('During node:', ptyProcess.process);
  }, 1000);
  setTimeout(function () {
    console.log('After node:', ptyProcess.process);
    ptyProcess.kill();
  }, 3000);
}, 1000);
