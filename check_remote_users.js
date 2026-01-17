const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
conn.on('ready', () => {
    console.log('Connected. Checking users.json...');

    // Read the file
    conn.exec('cat /opt/dss-edge/config/users.json', (err, stream) => {
        if (err) throw err;
        let content = '';
        stream.on('data', (d) => content += d.toString());
        stream.on('close', () => {
            console.log('--- CURRENT USERS.JSON ---');
            console.log(content || 'FILE NOT FOUND OR EMPTY');
            console.log('--------------------------');

            // If needed we can overwrite it
            conn.end();
        });
    });
}).connect(config);
