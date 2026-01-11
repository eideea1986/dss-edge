const http = require('http');

const cameras = [
    'cam_00e5d3a3',
    'cam_025a84ac',
    'cam_11b94237',
    'cam_1437927d',
    'cam_147c8a7a',
    'cam_1a84c362',
    'cam_1c81d1c9',
    'cam_2551a415',
    'cam_34b5a397',
    'cam_3aae9a4d'
];

console.log('=== Checking recordings for cameras ===\n');

cameras.forEach(camId => {
    http.get(`http://192.168.120.208:8080/api/playback/timeline/${camId}`, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            const result = JSON.parse(data);
            if (result.segments.length > 0) {
                console.log(`✓ ${camId}: ${result.segments.length} segments`);
                console.log(`  → http://192.168.120.208:8080/#/playback?camId=${camId}`);
            }
        });
    });
});
