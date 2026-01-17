const http = require('http');

function checkDate(date) {
    const options = {
        hostname: '192.168.120.208',
        port: 8080,
        path: `/api/playback/timeline-day/cam_34b5a397/${date}`,
        method: 'GET'
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            console.log(`Data for ${date}:`, data.substring(0, 200) + "..."); // Print first 200 chars
        });
    });

    req.on('error', (e) => {
        console.error(`Problem with request for ${date}: ${e.message}`);
    });

    req.end();
}

checkDate('2026-01-16'); // Today
checkDate('2026-01-15'); // Yesterday
