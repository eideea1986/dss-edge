const fs = require('fs');

const f1 = fs.readFileSync('local-monitor.js');
const f2 = fs.readFileSync('local-monitor-package.json');
const f3 = fs.readFileSync('nvr-monitor.service');

console.log(`echo "${f1.toString('base64')}" | base64 -d > /opt/nvr-monitor/monitor.js`);
console.log(`echo "${f2.toString('base64')}" | base64 -d > /opt/nvr-monitor/package.json`);
console.log(`echo "${f3.toString('base64')}" | base64 -d > /etc/systemd/system/nvr-monitor.service`);
