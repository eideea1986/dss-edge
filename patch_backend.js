const Client = require('ssh2').Client;
const fs = require('fs');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const filesToPatch = [
    { local: 'local-api/playback/playbackController.js', remote: '/opt/dss-edge/local-api/playback/playbackController.js' },
    { local: 'local-api/routes/playback.js', remote: '/opt/dss-edge/local-api/routes/playback.js' },
    { local: 'local-api/routes/ai-intelligence.js', remote: '/opt/dss-edge/local-api/routes/ai-intelligence.js' },
    { local: 'local-api/playback/playbackStats.js', remote: '/opt/dss-edge/local-api/playback/playbackStats.js' },
    { local: 'local-api/playback/livePlaylist.js', remote: '/opt/dss-edge/local-api/playback/livePlaylist.js' },
    { local: 'camera-manager/src/RetentionManager.js', remote: '/opt/dss-edge/camera-manager/src/RetentionManager.js' },
    { local: 'camera-manager/src/Recorder.js', remote: '/opt/dss-edge/camera-manager/src/Recorder.js' },
    { local: 'camera-manager/go2rtcUtils.js', remote: '/opt/dss-edge/camera-manager/go2rtcUtils.js' },
    { local: 'local-api/services/aiRequest.js', remote: '/opt/dss-edge/local-api/services/aiRequest.js' },
    { local: 'local-api/services/dispatchClient.js', remote: '/opt/dss-edge/local-api/services/dispatchClient.js' },
    { local: 'local-api/services/eventManager.js', remote: '/opt/dss-edge/local-api/services/eventManager.js' },
    { local: 'local-api/server.js', remote: '/opt/dss-edge/local-api/server.js' },
    { local: 'orchestrator/edgeOrchestrator.js', remote: '/opt/dss-edge/orchestrator/edgeOrchestrator.js' },
    { local: 'local-api/package.json', remote: '/opt/dss-edge/local-api/package.json' },
    { local: 'orchestrator/syncManager.js', remote: '/opt/dss-edge/orchestrator/syncManager.js' },
    { local: 'local-api/native/motion_detector.h', remote: '/opt/dss-edge/local-api/native/motion_detector.h' },
    { local: 'local-api/native/motion_detector.cpp', remote: '/opt/dss-edge/local-api/native/motion_detector.cpp' },
    { local: 'local-api/native/motion_lib.cpp', remote: '/opt/dss-edge/local-api/native/motion_lib.cpp' },
    { local: 'local-api/native/build.sh', remote: '/opt/dss-edge/local-api/native/build.sh' },
    { local: 'camera-manager/decoderManager.js', remote: '/opt/dss-edge/camera-manager/decoderManager.js' },
    { local: 'recorder/motionDetector.js', remote: '/opt/dss-edge/recorder/motionDetector.js' }
];

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Connected. Patching All...');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        let pending = filesToPatch.length;
        filesToPatch.forEach(file => {
            sftp.fastPut(file.local, file.remote, (err) => {
                if (err) console.error(`Error uploading ${file.local}:`, err);
                else console.log(`Up: ${file.local} -> ${file.remote}`);
                pending--;
                if (pending === 0) {
                    console.log('✅ PATCH SUCCESSFUL');
                    conn.end();
                }
            });
        });
    });
}).connect(config);
