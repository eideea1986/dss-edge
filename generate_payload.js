const fs = require('fs');
const path = require('path');

function getB64(file) { return fs.readFileSync(file, 'base64'); }

const mon = getB64('local-monitor.js');
const pkg = getB64('local-monitor-package.json');
const svc = getB64('nvr-monitor.service');

const script = [
    `mkdir -p /opt/nvr-monitor`,
    `rm -f /opt/nvr-monitor/monitor.js /opt/nvr-monitor/package.json /etc/systemd/system/nvr-monitor.service`,
    `echo "${mon}" | base64 -d > /opt/nvr-monitor/monitor.js`,
    `echo "${pkg}" | base64 -d > /opt/nvr-monitor/package.json`,
    `echo "${svc}" | base64 -d > /etc/systemd/system/nvr-monitor.service`,
    `systemctl daemon-reload`,
    `systemctl enable nvr-monitor`,
    `systemctl restart nvr-monitor`,
    `systemctl status nvr-monitor`
].join('\n');

fs.writeFileSync('deploy_payload.sh', script.replace(/\r/g, ''), { encoding: 'utf8' });
console.log('Payload generated.');
