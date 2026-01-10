const fs = require('fs');
const path = require('path');
const axios = require('axios');
const digestFetch = require('digest-fetch');

const CONFIG_PATH = "/opt/dss-edge/config/cameras.json";

async function optimizeHikvision(cam) {
    const client = new digestFetch(cam.user, cam.pass);
    const baseUrl = `http://${cam.ip}/ISAPI/Streaming/channels`;

    console.log(`[Optimize] Processing ${cam.name} (${cam.ip})...`);

    try {
        // 1. Get current video settings for 101 (Main) and 102 (Sub)
        for (const channel of [101, 102]) {
            try {
                const res = await client.fetch(`${baseUrl}/${channel}/video`);
                let xml = await res.text();

                // Get current FPS
                const fpsMatch = xml.match(/<maxFrameRate>(\d+)<\/maxFrameRate>/);
                const currentGop = xml.match(/<govLength>(\d+)<\/govLength>/);

                if (fpsMatch) {
                    const fps = parseInt(fpsMatch[1]);
                    // Set GOP to match FPS (1 I-Frame per second)
                    const newXml = xml.replace(/<govLength>\d+<\/govLength>/, `<govLength>${fps}</govLength>`);

                    if (currentGop && parseInt(currentGop[1]) === fps) {
                        console.log(`[${cam.name}] Channel ${channel} already optimized (GOP ${fps}).`);
                        continue;
                    }

                    console.log(`[${cam.name}] Updating Channel ${channel}: FPS ${fps} -> GOP ${fps}`);

                    const putRes = await client.fetch(`${baseUrl}/${channel}/video`, {
                        method: 'PUT',
                        body: newXml
                    });

                    if (putRes.ok) {
                        console.log(`[${cam.name}] Channel ${channel} optimized successfully.`);
                    } else {
                        console.error(`[${cam.name}] Failed to update Channel ${channel}: ${putRes.statusText}`);
                    }
                }
            } catch (e) {
                console.warn(`[${cam.name}] Channel ${channel} not reachable or error: ${e.message}`);
            }
        }
    } catch (e) {
        console.error(`[${cam.name}] Optimization failed: ${e.message}`);
    }
}

async function run() {
    if (!fs.existsSync(CONFIG_PATH)) {
        console.error("Config not found!");
        return;
    }

    const cams = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const hikCams = cams.filter(c => (c.manufacturer || "").toLowerCase().includes("hikvision") && c.enabled);

    console.log(`Found ${hikCams.length} Hikvision cameras for optimization.`);

    for (const cam of hikCams) {
        await optimizeHikvision(cam);
    }

    console.log("Optimization complete.");
}

run();
