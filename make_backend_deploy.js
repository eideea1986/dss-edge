const fs = require('fs');

function getB64(path) { return fs.readFileSync(path, 'base64'); }

const c1 = getB64('local-api/system/timeController.js');
const c2 = getB64('local-api/routes/system.js');
const c3 = getB64('local-api/server.js');

const script = [
    `mkdir -p /opt/dss-edge/local-api/system`,
    `echo "${c1}" | base64 -d > /opt/dss-edge/local-api/system/timeController.js`,
    `echo "${c2}" | base64 -d > /opt/dss-edge/local-api/routes/system.js`,
    `echo "${c3}" | base64 -d > /opt/dss-edge/local-api/server.js`,
    `systemctl restart dss-edge`
].join('\n');

fs.writeFileSync('deploy_backend.sh', script.replace(/\r/g, ''), { encoding: 'utf8' });
console.log('Backend Deploy Script Created');
