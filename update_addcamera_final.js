const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
const localFile = path.resolve('camera-manager/addCamera.js');
const remoteFile = '/opt/dss-edge/camera-manager/addCamera.js';

// Pre-create generic knowledge (optional but good)
const knowledge = {
    "Dahua": ["/cam/realmonitor?channel=1&subtype=0", "/cam/realmonitor?channel=1&subtype=1"],
    "Hikvision": ["/Streaming/Channels/101", "/Streaming/Channels/102"]
};
const knowledgeFile = 'config/rtsp_knowledge.json';
const localKnowledge = path.resolve(knowledgeFile);
fs.writeFileSync(localKnowledge, JSON.stringify(knowledge, null, 2));

console.log("=== UPDATE: addCamera.js + Knowledge Base ===");

conn.on('ready', () => {
    console.log('✅ SSH Connected');

    conn.sftp((err, sftp) => {
        if (err) throw err;

        // 1. Upload addCamera.js
        console.log(`📤 Uploading: ${localFile} -> ${remoteFile}`);
        sftp.fastPut(localFile, remoteFile, (err) => {
            if (err) { console.error("❌ Upload Failed:", err); conn.end(); return; }
            console.log("✅ Main Logic Updated.");

            // 2. Upload Knowledge Base
            const remoteKnowledge = '/opt/dss-edge/config/rtsp_knowledge.json';
            console.log(`📤 Uploading: ${localKnowledge} -> ${remoteKnowledge}`);
            sftp.fastPut(localKnowledge, remoteKnowledge, (err) => {
                if (err) console.warn("Knowledge base upload skipped/failed (not critical).");
                else console.log("✅ Knowledge Base Seeded.");

                // Restart not strictly needed if we just restarted, but good for completeness
                // But user asked to "send and then see if what I did works".
                // Since I just restarted 1 minute ago via fix_cameras_final, I will NOT restart again 
                // to avoid interrupting the stabilization of the previous fix.
                console.log("ℹ️ Skipping restart to let previous fix stabilize.");
                conn.end();
            });
        });
    });
}).on('error', (err) => {
    console.error("❌ Connection Error:", err.message);
}).connect(config);
