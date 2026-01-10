/* addCamera.js - Trassir-Style RTSP Probing with Machine Learning (Knowledge Base) */
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const startStream = require('./startStream');
const decoderManager = require('./decoderManager');
const cameraStore = require('../local-api/store/cameraStore');
const DeviceFactory = require('./adapters/DeviceFactory');

const KNOWLEDGE_DB = path.resolve(__dirname, '../../config/rtsp_knowledge.json');

/**
 * KNOWLEDGE BASE: Load learned RTSP paths
 */
function loadKnownRtsp() {
    try {
        if (fs.existsSync(KNOWLEDGE_DB)) {
            return JSON.parse(fs.readFileSync(KNOWLEDGE_DB, 'utf8'));
        }
    } catch (e) {
        console.warn("[Knowledge] Failed to load DB:", e.message);
    }
    return {}; // { "Hikvision": ["/url1", "/url2"], "Dahua": [...] }
}

/**
 * KNOWLEDGE BASE: Save working RTSP path for vendor
 * We save generic templates, not full URLs with IPs/Passwords.
 */
function saveKnownRtsp(vendor, fullUrl, ip, user, pass) {
    if (!vendor || vendor === "Generic") return;

    // Extract template from full URL
    // e.g. rtsp://u:p@ip:554/cam/realmonitor?channel=1... -> /cam/realmonitor?channel=1...
    let template = "";
    try {
        // Simple heuristic: remove everything before the path
        // but keep query params
        const u = new URL(fullUrl);
        template = u.pathname + u.search;
    } catch (e) {
        // Fallback for non-standard URLs
        const parts = fullUrl.split(ip + ":554");
        if (parts.length > 1) template = parts[1];
        else {
            const parts2 = fullUrl.split(ip);
            if (parts2.length > 1) template = parts2[1];
        }
    }

    if (!template || template.length < 2) return;

    // Load, Update, Save
    let db = loadKnownRtsp();
    if (!db[vendor]) db[vendor] = [];

    // Add unique
    if (!db[vendor].includes(template)) {
        console.log(`[Knowledge] 🧠 LEARNED new path for ${vendor}: ${template}`);
        db[vendor].unshift(template); // Put newest first

        // Limit to 5 per vendor to reject noise
        if (db[vendor].length > 5) db[vendor] = db[vendor].slice(0, 5);

        try {
            fs.writeFileSync(KNOWLEDGE_DB, JSON.stringify(db, null, 2));
        } catch (e) { }
    }
}

/**
 * 1. Generare Lista Candidați (Priority: Learned -> Common -> Generic)
 */
function generateRtspCandidates(camera) {
    const user = camera.credentials?.user || "admin";
    const pass = camera.credentials?.pass || "";
    const ip = camera.ip;
    const auth = pass ? `${user}:${pass}@${ip}` : `${ip}`;
    const baseUrl = `rtsp://${auth}:554`;

    let candidates = [];

    // A. Knowledge Base (Most likely to work based on history)
    const db = loadKnownRtsp();
    const vendor = camera.vendor;
    if (vendor && db[vendor]) {
        db[vendor].forEach(tpl => candidates.push(baseUrl + tpl));
    }

    // B. Static Common List (The "Backbone")
    const common = [
        // Dahua / IMOU / OEM
        `${baseUrl}/cam/realmonitor?channel=1&subtype=0`, // Main
        `${baseUrl}/cam/realmonitor?channel=1&subtype=1`, // Sub
        `${baseUrl}/cam/realmonitor?channel=0&subtype=0`, // Alternative (EZ-IP sometimes)

        // Hikvision / HiLook / OEM
        `${baseUrl}/Streaming/Channels/101`,  // Main Standard
        `${baseUrl}/Streaming/Channels/102`,  // Sub stream
        `${baseUrl}/Streaming/Channels/1`,    // Legacy Old

        // Generic / ONVIF Defaults
        `${baseUrl}/live/main`,
        `${baseUrl}/live/sub`,
        `${baseUrl}/h264/ch1/main/av_stream`,
        `${baseUrl}/stream1`,
        `${baseUrl}/1/h264major`, // Uniview
        `${baseUrl}/profile1`      // Axis/Others
    ];

    candidates.push(...common);

    // De-duplicate URLs
    return [...new Set(candidates)];
}

/**
 * 2. Probe REAL cu FFmpeg
 */
function probeRtsp(url) {
    return new Promise((resolve) => {
        // TCP este obligatoriu
        const args = [
            '-rtsp_transport', 'tcp',
            '-i', url,
            '-t', '2',       // Max 2 secunde test
            '-f', 'null',    // Nu scriem nicăieri
            '-'
        ];

        const p = spawn('ffmpeg', args);
        let hasFrame = false;

        p.stderr.on('data', (d) => {
            const output = d.toString();
            // Detectăm frame decodat
            if (output.includes('frame=') && !output.includes('frame=    0')) {
                hasFrame = true;
                p.kill();
            }
        });

        p.on('close', () => resolve(hasFrame));
        p.on('error', () => resolve(false));
    });
}

/**
 * 3. Discover Valid Stream (Iterativ)
 */
async function findWorkingStream(cameraData) {
    console.log(`[Probe] Starting discovery for ${cameraData.ip}...`);
    const candidates = generateRtspCandidates(cameraData);

    for (const url of candidates) {
        // console.log(`[Probe] Testing: ${url}`);
        const working = await probeRtsp(url);

        if (working) {
            console.log(`[Probe] ✅ SUCCES: ${url}`);

            // SAVE KNOWLEDGE
            saveKnownRtsp(cameraData.vendor, url, cameraData.ip, cameraData.credentials.user, cameraData.credentials.pass);

            return url;
        }
    }

    console.warn(`[Probe] ❌ Failed to find stream for ${cameraData.ip}`);
    return null;
}

/**
 * Main Add Camera Function
 */
module.exports = async function addCamera(data) {
    console.log(`[AddCamera] Request: ${data.ip || data.rtsp}`);

    let id = data.id || `cam_${crypto.randomUUID().split('-')[0]}`;
    let camera = {
        id,
        name: data.name || (data.ip ? `Camera ${data.ip}` : `Camera ${id}`),
        vendor: data.manufacturer || "Generic",
        ip: data.ip || "",
        credentials: {
            user: data.user || "admin",
            pass: data.pass || ""
        },
        streams: {
            main: data.rtsp || "",
            sub: ""
        },
        status: "OFFLINE",
        enabled: true,
        record: true
    };

    // A. Probing Logic - Only verify valid stream confirmed frames
    if (!camera.streams.main && camera.ip) {
        console.log(`[AddCamera] Initiating Smart Probe...`);
        const foundUrl = await findWorkingStream(camera);

        if (foundUrl) {
            camera.streams.main = foundUrl;
            camera.streams.sub = foundUrl; // Clone for now
            camera.status = "ONLINE";
        } else {
            console.error(`[AddCamera] Probe Failed. Camera saved as OFFLINE.`);
        }
    } else if (camera.streams.main) {
        // Manual URL check & Learn
        const works = await probeRtsp(camera.streams.main);
        camera.status = works ? "ONLINE" : "OFFLINE";
        if (works) {
            saveKnownRtsp(camera.vendor, camera.streams.main, camera.ip, camera.credentials.user, camera.credentials.pass);
        }
    }

    // B. Check Duplicates
    const existing = cameraStore.findByRtsp(camera.streams.main);
    if (existing && camera.streams.main) {
        throw new Error(`Duplicate Camera: Stream already assigned to ${existing.name}`);
    }

    // C. Save
    cameraStore.add(camera);
    console.log(`[AddCamera] Saved ${camera.id} (Status: ${camera.status})`);

    // D. Start Services
    if (camera.streams.main) {
        await startStream(camera);
        decoderManager.startDecoder(camera);
    }

    return camera;
};
