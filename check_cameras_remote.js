const http = require('http');

const options = {
    hostname: '192.168.120.208',
    port: 8080,
    path: '/api/cameras/config',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log("Cameras:", data);
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
