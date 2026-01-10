const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
const scriptContent = fs.readFileSync(path.resolve('update_camera_status.sh'), 'utf8');

console.log("=== SETUP AUTO STATUS UPDATE ===");

conn.on('ready', () => {
    // Upload script
    conn.sftp((err, sftp) => {
        if (err) throw err;

        const scriptPath = '/opt/dss-edge/update_camera_status.sh';
        sftp.writeFile(scriptPath, scriptContent, (err) => {
            if (err) throw err;
            console.log("✅ Script uploaded");

            // Make executable + add to cron
            const cmd = `
                chmod +x ${scriptPath}
                (crontab -l 2>/dev/null | grep -v update_camera_status; echo "* * * * * ${scriptPath} >> /opt/dss-edge/status_update.log 2>&1") | crontab -
                echo "Cron job installed. First run in 1 minute."
                ${scriptPath}
            `;

            conn.exec(cmd, (err, stream) => {
                stream.pipe(process.stdout);
                stream.on('close', () => {
                    console.log("\n✅ Auto-update configured. Status will refresh every minute.");
                    conn.end();
                });
            });
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
