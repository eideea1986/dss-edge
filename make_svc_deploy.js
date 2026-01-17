const fs = require('fs');
const f = fs.readFileSync('nvr-monitor.service');
const cmd = `echo "${f.toString('base64')}" | base64 -d > /etc/systemd/system/nvr-monitor.service\n`;
fs.writeFileSync('deploy_svc.sh', cmd.replace(/\r/g, ''), { encoding: 'utf8' });
