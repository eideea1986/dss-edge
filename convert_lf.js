const fs = require('fs');
let s = fs.readFileSync('deploy_script.sh', 'utf8');
s = s.replace(/\r\n/g, '\n');
fs.writeFileSync('deploy_script_lf.sh', s, { encoding: 'utf8' });
console.log('Converted to LF');
