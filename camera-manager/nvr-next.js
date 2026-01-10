const fs = require('fs');
const path = require('path');
const recorder = require('./src/Recorder');
const db = require('./src/Database');

// Simulare încărcare config
const configPath = path.join(__dirname, '../config/cameras.json');

function initNVR() {
    console.log("-----------------------------------------");
    console.log(" DSS SMART GUARD - NEXT GEN NVR ENGINE  ");
    console.log("-----------------------------------------");

    if (!fs.existsSync(configPath)) {
        console.error("Config not found!");
        return;
    }

    const cameras = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    cameras.forEach(cam => {
        if (cam.enabled && cam.record) {
            console.log(`[Engine] Starting Recorder for ${cam.name} (${cam.id})`);
            recorder.startRecording(cam);
        }
    });
}

initNVR();
