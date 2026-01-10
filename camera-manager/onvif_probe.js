const onvif = require('node-onvif');

const targets = ['192.168.120.144', '192.168.120.112', '192.168.120.110', '192.168.120.128'];
const credentials = [
    { u: 'admin', p: 'a1b2c3d4' },
    { u: 'admin', p: 'admin' },
    { u: 'admin', p: '123456' },
    { u: 'webadmin', p: 'webadmin' }
];

async function probe(ip) {
    console.log(`\nProbing ${ip}...`);
    for (const cred of credentials) {
        try {
            const streamUri = await new Promise((resolve, reject) => {
                new onvif.Cam({
                    hostname: ip,
                    username: cred.u,
                    password: cred.p,
                    timeout: 5000
                }, function (err) {
                    if (err) return reject(err);
                    this.getStreamUri({ protocol: 'RTSP' }, (err, stream) => {
                        if (err) return reject(err);
                        resolve(stream.uri);
                    });
                });
            });
            console.log(`[SUCCESS] ${ip} -> ${streamUri} (User: ${cred.u}, Pass: ${cred.p})`);
            return;
        } catch (e) {
            // console.log(`  Failed with ${cred.u}:${cred.p} - ${e.message}`);
        }
    }
    console.log(`[FAILED] Could not connect to ${ip} with any credentials.`);
}

(async () => {
    for (const t of targets) {
        await probe(t);
    }
})();
