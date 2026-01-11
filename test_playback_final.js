const http = require('http');

console.log('=== Testing Enterprise Playback (TRASSIR-Style) ===\n');

// 1. Get timeline
console.log('1. Fetching timeline...');
http.get('http://192.168.120.208:8080/api/playback/timeline/cam_00e5d3a3', (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
        const timeline = JSON.parse(data);
        console.log(`Found ${timeline.segments.length} segments\n`);

        if (timeline.segments.length === 0) {
            console.log('No segments available');
            return;
        }

        // Filter valid segments (exclude broken ones with negative timestamps)
        const validSegs = timeline.segments.filter(s => s.start_ts > 0 && s.end_ts > 0);

        if (validSegs.length === 0) {
            console.log('No valid segments found');
            return;
        }

        const firstSeg = validSegs[0];
        console.log(`2. Starting playback from ${firstSeg.start_ts} to ${firstSeg.end_ts}...\n`);

        const payload = JSON.stringify({
            camId: 'cam_00e5d3a3',
            from: firstSeg.start_ts,
            to: firstSeg.end_ts,
            speed: 1.0
        });

        const req = http.request({
            hostname: '192.168.120.208',
            port: 8080,
            path: '/api/playback/start',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payload.length
            }
        }, (res2) => {
            let data2 = '';
            res2.on('data', d => data2 += d);
            res2.on('end', () => {
                const result = JSON.parse(data2);
                console.log('✅ Playback started!\n');
                console.log(JSON.stringify(result, null, 2));
                console.log(`\n📺 RTSP URL: ${result.rtspUrl}`);
                console.log(`🌐 WebRTC: http://192.168.120.208:8080${result.webrtcUrl}`);
                console.log('\nNote: It may take a few seconds for FFmpeg to start streaming.');
            });
        });

        req.write(payload);
        req.end();
    });
});
