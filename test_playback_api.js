const http = require('http');

// Test playback API
const testPlayback = async () => {
    console.log('=== Testing Playback Engine ===\n');

    // 1. Get timeline for a camera to find valid timestamps
    console.log('1. Fetching timeline for cam_00e5d3a3...');

    const timelineReq = http.request({
        hostname: '192.168.120.208',
        port: 8080,
        path: '/api/playback/timeline/cam_00e5d3a3',
        method: 'GET'
    }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            const timeline = JSON.parse(data);
            console.log('Timeline:', timeline);

            if (!timeline.segments || timeline.segments.length === 0) {
                console.log('No segments available for this camera');
                return;
            }

            // 2. Start playback with first segment
            const firstSeg = timeline.segments[0];
            console.log(`\n2. Starting playback from ${firstSeg.start_ts} to ${firstSeg.end_ts}...\n`);

            const playbackData = JSON.stringify({
                camId: 'cam_00e5d3a3',
                from: firstSeg.start_ts,
                to: firstSeg.end_ts,
                speed: 1.0
            });

            const playbackReq = http.request({
                hostname: '192.168.120.208',
                port: 8080,
                path: '/api/playback/start',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': playbackData.length
                }
            }, (res2) => {
                let data2 = '';
                res2.on('data', d => data2 += d);
                res2.on('end', () => {
                    const result = JSON.parse(data2);
                    console.log('Playback started:');
                    console.log(JSON.stringify(result, null, 2));
                    console.log(`\n✓ Access playback at: ${result.rtspUrl}`);
                    console.log(`✓ Or use WebRTC at: http://192.168.120.208:8080${result.webrtcUrl}`);
                });
            });

            playbackReq.write(playbackData);
            playbackReq.end();
        });
    });

    timelineReq.end();
};

testPlayback();
