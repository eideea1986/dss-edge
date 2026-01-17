const fs = require('fs');

const f1 = fs.readFileSync('local-monitor.js');
const f2 = fs.readFileSync('local-monitor-package.json');
const f3 = fs.readFileSync('nvr-monitor.service');

const c1 = `echo "${f1.toString('base64')}" | base64 -d > /opt/nvr-monitor/monitor.js\n`;
const c2 = `echo "${f2.toString('base64')}" | base64 -d > /opt/nvr-monitor/package.json\n`;
const c3 = `echo "${f3.toString('base64')}" | base64 -d > /etc/systemd/system/nvr-monitor.service\n`;

const script = c1 + c2 + c3;
fs.writeFileSync('deploy_script.sh', script, { encoding: 'utf8' });
console.log('deploy_script.sh created');
