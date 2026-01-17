const fs = require('fs');
const { execSync } = require('child_process');

try {
    const cams = JSON.parse(fs.readFileSync('/opt/dss-edge/config/cameras.json', 'utf8'));
    const enabled = cams.filter(c => c.enabled).map(c => c.id);

    const ps = execSync('ps -ef | grep ffmpeg | grep segment').toString();

    console.log(`Total Enabled Cameras: ${enabled.length}`);
    const runningCount = ps.split('\n').filter(l => l.includes('ffmpeg') && l.includes('segment')).length;
    console.log(`Running Recorder Processes: ${runningCount}`);

    console.log("--- MISSING RECORDERS ---");
    enabled.forEach(id => {
        // Simple check if ID is in process list string
        if (!ps.includes(id)) {
            console.log(`[FAIL] ${id}`);
        }
    });

} catch (e) {
    console.error("Error:", e.message);
}
