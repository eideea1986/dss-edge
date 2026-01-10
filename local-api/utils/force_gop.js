const fs = require('fs');
const digestFetch = require('digest-fetch');

const CONFIG_PATH = "/opt/dss-edge/config/cameras.json";

async function optimizeHikvision(cam) {
    if ((cam.manufacturer || "").toLowerCase().indexOf("hikvision") === -1) return;

    // Create digest client
    const client = new digestFetch(cam.user || "admin", cam.pass || "admin");
    const baseUrl = `http://${cam.ip}/ISAPI/Streaming/channels`;

    console.log(`[Optimize] Processing ${cam.name} (${cam.ip})...`);

    try {
        // Force GOP=FPS on Channel 101 (Main Stream)
        // This is THE fix for 3-5s delay. GOP MUST be small.
        const channel = 101;

        // 1. Get Settings
        const res = await client.fetch(`${baseUrl}/${channel}/video`);
        let xml = await res.text();

        // 2. PARSE FPS
        const fpsMatch = xml.match(/<maxFrameRate>(\d+)<\/maxFrameRate>/);
        if (fpsMatch) {
            const fps = parseInt(fpsMatch[1]); // e.g., 20 or 25

            // 3. FORCE GOP = FPS (1 second I-Frame interval)
            // If GOP is 50 or 100 on a 20fps camera, you wait 2.5-5 seconds for video.
            // By setting GOP=20, you wait max 1 second.
            if (xml.includes("<govLength>")) {
                const newXml = xml.replace(/<govLength>\d+<\/govLength>/, `<govLength>${fps}</govLength>`);

                console.log(`[${cam.name}] Setting GOP to ${fps} (Instant-On)...`);

                const putRes = await client.fetch(`${baseUrl}/${channel}/video`, {
                    method: 'PUT',
                    body: newXml
                });

                if (putRes.ok) console.log("   -> OK");
                else console.log("   -> FAIL: " + putRes.status);
            }
        }
    } catch (e) {
        console.warn(`[${cam.name}] Error: ${e.message}`);
    }
}

async function run() {
    try {
        const cams = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        const enabled = cams.filter(c => c.enabled);

        console.log(`Optimizing ${enabled.length} cameras...`);

        for (const cam of enabled) {
            await optimizeHikvision(cam);
        }
    } catch (e) {
        console.error("Script failed:", e);
    }
}

run();
