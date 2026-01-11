const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

console.log("=== DSS EDGE DEBUGGER ===");
console.log(`Node Version: ${process.version}`);
console.log(`Platform: ${process.platform}`);
console.log(`CWD: ${process.cwd()}`);

// 1. Check Configs
const configPath = path.resolve('config/cameras.json'); // Relative from root
if (!fs.existsSync(configPath)) {
    console.error("❌ config/cameras.json NOT FOUND at " + configPath);
} else {
    console.log("✅ config/cameras.json found at " + configPath);
    try {
        const cams = JSON.parse(fs.readFileSync(configPath));
        console.log(`   Found ${cams.length} cameras.`);
        cams.forEach(c => {
            console.log(`   - Cam ${c.id}: Status=${c.status || 'UNKNOWN'}, Main=${c.streams?.main}`);
        });
    } catch (e) {
        console.error("❌ Error parsing cameras.json:", e.message);
    }
}

// 2. Check Go2RTC
console.log("\nChecking Go2RTC API (http://127.0.0.1:1984/api/streams)...");
const req = http.get('http://127.0.0.1:1984/api/streams', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log("✅ Go2RTC Online (Port 1984)");
        try {
            const streams = JSON.parse(data);
            console.log("   Active Streams:", Object.keys(streams));
        } catch (e) {
            console.log("   (Could not parse streams JSON)");
        }
    });
});
req.on('error', (e) => {
    console.error("❌ Go2RTC API Unreachable:", e.message);
    console.log("   -> DecoderManager will fail if Go2RTC is down.");
});
req.setTimeout(3000, () => { req.destroy(); console.error("❌ Go2RTC Timeout"); });

// 3. Test FFMPEG availability
console.log("\nChecking FFmpeg...");
const ffmpeg = spawn('ffmpeg', ['-version']);
ffmpeg.on('error', (err) => {
    console.error("❌ FFmpeg NOT found in PATH. DecoderManager WILL FAIL.");
    console.log("   Error:", err.message);
    console.log("   Please install ffmpeg or add it to system PATH.");
});
ffmpeg.stdout.on('data', () => { }); // consume
ffmpeg.on('exit', (code) => {
    if (code === 0) console.log("✅ FFmpeg found and executable.");
});

// 4. Check RAMDISK Permissions
const ramdiskRec = path.resolve('recorder/ramdisk/snapshots');
try {
    if (!fs.existsSync(ramdiskRec)) {
        fs.mkdirSync(ramdiskRec, { recursive: true });
        console.log("✅ Created RAMDISK dir:", ramdiskRec);
    }
    fs.accessSync(ramdiskRec, fs.constants.W_OK);
    console.log("✅ RAMDISK is writable.");
} catch (e) {
    console.warn("⚠️ RAMDISK Permission Warning (Recorder path):", e.message);
}

// Check /opt path if on Linux
if (process.platform === 'linux') {
    const optPath = "/opt/dss-edge/recorder/ramdisk/snapshots";
    try {
        if (fs.existsSync(optPath)) {
            fs.accessSync(optPath, fs.constants.W_OK);
            console.log("✅ /opt RAMDISK is writable.");
        } else {
            console.log("ℹ️ /opt RAMDISK does not exist (OK if using relative paths).");
        }
    } catch (e) {
        console.warn("⚠️ /opt RAMDISK Permission Error:", e.message);
    }
}
