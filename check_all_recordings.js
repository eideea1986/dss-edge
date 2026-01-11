const http = require('http');

const allCameras = [
    'cam_00e5d3a3', 'cam_025a84ac', 'cam_11b94237', 'cam_1437927d',
    'cam_147c8a7a', 'cam_1a84c362', 'cam_1c81d1c9', 'cam_2551a415',
    'cam_34b5a397', 'cam_3aae9a4d', 'cam_41b350f6', 'cam_42413348',
    'cam_451a85ab', 'cam_458905a5', 'cam_4965bcc9', 'cam_4c5cf487',
    'cam_53c9d22d', 'cam_5506023b', 'cam_6e170adf', 'cam_71915227',
    'cam_80316838', 'cam_843f7508', 'cam_938705c5', 'cam_a3a840b0',
    'cam_bf1b2728', 'cam_ccb3aba7', 'cam_d2bced67', 'cam_e4a9af3b',
    'cam_f24f474f', 'cam_f9e69335', 'cam_fc12ebf7', 'cam_ff0486d4'
];

console.log('=== Full Recording Status ===\n');

let done = 0;
const results = [];

allCameras.forEach(camId => {
    http.get(`http://192.168.120.208:8080/api/playback/timeline/${camId}`, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            const result = JSON.parse(data);
            results.push({ camId, count: result.segments.length });
            done++;

            if (done === allCameras.length) {
                results.sort((a, b) => b.count - a.count);
                results.forEach(r => {
                    const status = r.count > 0 ? '✓' : '✗';
                    console.log(`${status} ${r.camId}: ${r.count} segments`);
                });

                const withRecordings = results.filter(r => r.count > 0).length;
                const withoutRecordings = results.filter(r => r.count === 0).length;

                console.log(`\n=== Summary ===`);
                console.log(`With recordings: ${withRecordings}/${allCameras.length}`);
                console.log(`Without recordings: ${withoutRecordings}/${allCameras.length}`);
            }
        });
    }).on('error', (e) => {
        console.error(`Error checking ${camId}:`, e.message);
        done++;
    });
});
