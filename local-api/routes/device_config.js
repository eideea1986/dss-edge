const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const DigestFetch = require('digest-fetch');

const camsPath = path.resolve(__dirname, "../../config/cameras.json");

function getCam(id) {
    try {
        if (!fs.existsSync(camsPath)) return null;
        const cams = JSON.parse(fs.readFileSync(camsPath, "utf8"));
        return cams.find(c => c.id === id);
    } catch (e) { return null; }
}

// Helper to make Hikvision request
async function hikRequest(cam, method, path, body = null) {
    const client = new DigestFetch(cam.user, cam.pass);
    const url = `http://${cam.ip}${path}`;
    const opts = { method: method };
    if (body) {
        opts.body = body;
        opts.headers = { 'Content-Type': 'application/xml' };
    }

    console.log(`[DeviceConfig] ${method} ${url}`);
    const res = await client.fetch(url, opts);
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Hikvision Error ${res.status}: ${txt}`);
    }
    return await res.text();
}

// GET Configuration & Capabilities
router.get("/:id", async (req, res) => {
    const cam = getCam(req.params.id);
    if (!cam) return res.status(404).json({ error: "Camera not found" });

    // Only Hikvision supported for now
    if (!cam.manufacturer?.toLowerCase().includes("hikvision")) {
        return res.status(400).json({ error: "Only Hikvision devices supported for direct config" });
    }

    try {
        // Read Channel 101 (Main) Config and Capabilities
        const [xml, capsXml] = await Promise.all([
            hikRequest(cam, 'GET', '/ISAPI/Streaming/channels/101'),
            hikRequest(cam, 'GET', '/ISAPI/Streaming/channels/101/capabilities')
        ]);

        // --- PARSE CURRENT SETTINGS ---
        const codec = xml.match(/<videoCodecType>(.*?)<\/videoCodecType>/)?.[1];
        const width = xml.match(/<videoResolutionWidth>(.*?)<\/videoResolutionWidth>/)?.[1];
        const height = xml.match(/<videoResolutionHeight>(.*?)<\/videoResolutionHeight>/)?.[1];
        const frameRate = xml.match(/<maxFrameRate>(.*?)<\/maxFrameRate>/)?.[1];
        const govLength = xml.match(/<GovLength>(.*?)<\/GovLength>/)?.[1];

        // --- PARSE CAPABILITIES ---
        const codecOpts = capsXml.match(/<videoCodecType opt="(.*?)"/)?.[1]?.split(',') || ["H.264", "H.265"];
        const wOpts = capsXml.match(/<videoResolutionWidth opt="(.*?)"/)?.[1]?.split(',') || [];
        const hOpts = capsXml.match(/<videoResolutionHeight opt="(.*?)"/)?.[1]?.split(',') || [];
        const fpsOpts = capsXml.match(/<maxFrameRate opt="(.*?)"/)?.[1]?.split(',') || [];
        const gopMin = capsXml.match(/<GovLength min="(.*?)"/)?.[1] || "1";
        const gopMax = capsXml.match(/<GovLength max="(.*?)"/)?.[1] || "400";

        // Map resolution pairs
        const resolutions = [];
        for (let i = 0; i < Math.min(wOpts.length, hOpts.length); i++) {
            const w = wOpts[i], h = hOpts[i];
            let label = `${w}x${h}`;
            if (w === "1920" && height === "1080") label = "1080p";
            if (w === "1280" && h === "720") label = "720p";
            if (w === "2560" && h === "1440") label = "4MP";
            if (w === "3840" && h === "2160") label = "4K";
            resolutions.push({ label, width: parseInt(w), height: parseInt(h) });
        }

        const fps = frameRate ? (parseInt(frameRate) / 100) : 0;
        const availableFps = fpsOpts.map(f => parseInt(f) / 100).sort((a, b) => b - a);

        const currentSettings = {
            codec,
            resolution: `${width}x${height}`,
            width: parseInt(width),
            height: parseInt(height),
            fps,
            gop: parseInt(govLength) || 0
        };

        // --- AUTO-HEAL local cameras.json ---
        try {
            const cams = JSON.parse(fs.readFileSync(camsPath, "utf8"));
            const idx = cams.findIndex(c => c.id === req.params.id);
            if (idx !== -1) {
                let changed = false;
                if (codec && cams[idx].codec !== codec) { cams[idx].codec = codec; changed = true; }
                if (width && height && cams[idx].resolution !== currentSettings.resolution) { cams[idx].resolution = currentSettings.resolution; changed = true; }
                if (frameRate && cams[idx].fps !== fps) { cams[idx].fps = fps; changed = true; }
                if (govLength && cams[idx].gop !== currentSettings.gop) { cams[idx].gop = currentSettings.gop; changed = true; }

                if (changed) {
                    fs.writeFileSync(camsPath, JSON.stringify(cams, null, 2));
                    console.log(`[DeviceConfig] Auto-healed cameras.json for ${cam.ip} to match hardware.`);
                }
            }
        } catch (err) { console.error("[DeviceConfig] Auto-heal failed:", err.message); }

        res.json({
            current: currentSettings,
            capabilities: {
                codecs: codecOpts,
                resolutions,
                fps: availableFps,
                gopRange: { min: parseInt(gopMin), max: parseInt(gopMax) }
            },
            channel: 101
        });
    } catch (e) {
        console.error("Config Fetch Failed:", e.message);
        res.status(502).json({ error: "Failed to read from camera: " + e.message });
    }
});

// POST Configuration (Apply Changes)
router.post("/:id", async (req, res) => {
    const cam = getCam(req.params.id);
    if (!cam) return res.status(404).json({ error: "Camera not found" });

    const { codec, resolution, fps, gop } = req.body;

    try {
        // 1. Get current XML first to preserve other settings
        const currentXml = await hikRequest(cam, 'GET', '/ISAPI/Streaming/channels/101');

        // 2. Modify XML
        let newXml = currentXml;

        // Helper to replace tag content case-insensitively and handle whitespace
        const replaceTag = (xml, tag, value) => {
            const re = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'i');
            return xml.replace(re, `<${tag}>${value}</${tag}>`);
        };

        if (codec) newXml = replaceTag(newXml, 'videoCodecType', codec);

        if (resolution) {
            let w, h;
            if (resolution === "1080p" || resolution === "1920x1080") { w = 1920; h = 1080; }
            else if (resolution === "720p" || resolution === "1280x720") { w = 1280; h = 720; }
            else if (resolution === "4K" || resolution === "3840x2160") { w = 3840; h = 2160; }
            else if (resolution === "4MP" || resolution === "2560x1440") { w = 2560; h = 1440; }
            else if (resolution === "5MP" || resolution === "2560x1920") { w = 2560; h = 1920; }
            else if (resolution === "VGA" || resolution === "640x480") { w = 640; h = 480; }
            else if (resolution === "4CIF" || resolution === "704x576") { w = 704; h = 576; }

            if (w && h) {
                newXml = replaceTag(newXml, 'videoResolutionWidth', w);
                newXml = replaceTag(newXml, 'videoResolutionHeight', h);
            }
        }

        if (fps) {
            const fpsVal = parseInt(fps) * 100;
            newXml = replaceTag(newXml, 'maxFrameRate', fpsVal);
        }

        if (gop) {
            newXml = replaceTag(newXml, 'GovLength', gop);
        }

        // 3. PUT Back
        console.log(`[DeviceConfig] Applying changes to ${cam.ip}...`);
        await hikRequest(cam, 'PUT', '/ISAPI/Streaming/channels/101', newXml);

        // 4. ALSO update our local cameras.json to stay in sync
        try {
            const cams = JSON.parse(fs.readFileSync(camsPath, "utf8"));
            const idx = cams.findIndex(c => c.id === cam.id);
            if (idx !== -1) {
                if (codec) cams[idx].codec = codec;
                if (resolution) cams[idx].resolution = resolution;
                if (fps) cams[idx].fps = parseInt(fps);
                if (gop) cams[idx].gop = parseInt(gop);
                fs.writeFileSync(camsPath, JSON.stringify(cams, null, 2));
                console.log(`[DeviceConfig] Local cameras.json updated for ${cam.ip}`);
            }
        } catch (err) {
            console.error("[DeviceConfig] Failed to update local JSON:", err.message);
        }

        res.json({ success: true, message: "Camera configuration updated!" });

    } catch (e) {
        console.error("Config Write Failed:", e.message);
        res.status(502).json({ error: "Failed to update camera: " + e.message });
    }
});

module.exports = router;
