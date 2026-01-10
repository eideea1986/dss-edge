const express = require("express");
const router = express.Router();
const axios = require("axios");
const onvif = require('onvif');
const { exec } = require('child_process');
const CameraService = require("../services/CameraService");

// --- HELPERS ---
function generatePossibleRTSP(ip, user, pass) {
    // CRITICAL FIX: Encode credentials to handle special chars like @, #, :
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(pass);

    return [
        `rtsp://${u}:${p}@${ip}:554/Streaming/Channels/101`, // Hikvision Main
        `rtsp://${u}:${p}@${ip}:554/cam/realmonitor?channel=1&subtype=0`, // Dahua Main
        `rtsp://${u}:${p}@${ip}:554/live/main`, // Trassir/Generic
        `rtsp://${u}:${p}@${ip}:554/live/ch0` // Axis/Other
    ];
}

async function checkStreamTCP(url) {
    if (!url) return false;
    return new Promise(resolve => {
        // Use a shorter timeout for probe to key fast
        exec(`ffprobe -v quiet -rtsp_transport tcp -i "${url}" -show_streams -print_format json`, { timeout: 5000 }, (err) => {
            resolve(!err);
        });
    });
}

// --- TRASSIR-STYLE DEEP INTERROGATION ---
async function interrogateCamera(ip, user, pass) {
    return new Promise((resolve, reject) => {
        const cam = new onvif.Cam({
            hostname: ip,
            username: user,
            password: pass,
            timeout: 5000,
            preserveAddress: true
        }, function (err) {
            if (err) return reject(err);

            const rawProfiles = cam.profiles || {};
            const extractedProfiles = [];
            const tokens = Object.keys(rawProfiles);

            if (tokens.length === 0) return reject(new Error("No profiles found via ONVIF"));

            let processed = 0;
            tokens.forEach(token => {
                const p = rawProfiles[token];
                let width = 0, height = 0, codec = "Unknown", fps = 0;

                if (p.videoEncoderConfiguration) {
                    if (p.videoEncoderConfiguration.resolution) {
                        width = p.videoEncoderConfiguration.resolution.width;
                        height = p.videoEncoderConfiguration.resolution.height;
                    }
                    codec = p.videoEncoderConfiguration.encoding;
                }

                cam.getStreamUri({ protocol: 'RTSP', profileToken: token }, (err, stream) => {
                    let rtspUrl = "";
                    if (!err && stream && stream.uri) {
                        rtspUrl = stream.uri;

                        // INJECT CREDENTIALS SAFELY
                        // If standard URL doesn't have them, inject them encoded
                        if (!rtspUrl.includes(encodeURIComponent(user)) && !rtspUrl.includes(user)) {
                            const parts = rtspUrl.split('://');
                            if (parts.length === 2) {
                                const u = encodeURIComponent(user);
                                const p = encodeURIComponent(pass);
                                rtspUrl = `${parts[0]}://${u}:${p}@${parts[1]}`;
                            }
                        }
                    }

                    extractedProfiles.push({
                        token: token,
                        name: p.name || `Profile ${token}`,
                        resolution: `${width}x${height}`,
                        width: width,
                        height: height,
                        codec: codec,
                        rtsp: rtspUrl
                    });

                    processed++;
                    if (processed === tokens.length) {
                        extractedProfiles.sort((a, b) => (b.width * b.height) - (a.width * a.height));
                        resolve({ info: cam.deviceInformation || {}, profiles: extractedProfiles });
                    }
                });
            });
        });
    });
}

// --- ROUTES ---

router.post("/add", async (req, res) => {
    try {
        const { ip, user, pass, manufacturer } = req.body;
        console.log(`[Add] Processing ${ip}...`);

        if (!ip || !user || !pass) return res.status(400).json({ error: "Missing Credentials" });

        let data = null;
        let method = "ONVIF";

        // STRATEGY 1: Full ONVIF
        try {
            data = await interrogateCamera(ip, user, pass);
        } catch (onvifErr) {
            console.warn(`[Add] ONVIF Fail: ${onvifErr.message}. Switch to RTSP Scan.`);

            // STRATEGY 2: Smart RTSP Scan (Encoded Creds)
            const candidates = generatePossibleRTSP(ip, user, pass);
            let validUrl = "";

            for (const url of candidates) {
                if (await checkStreamTCP(url)) {
                    validUrl = url;
                    break;
                }
            }

            if (validUrl) {
                method = "RTSP_FALLBACK";
                data = {
                    info: { manufacturer: manufacturer || "Generic Device", model: "RTSP Camera" },
                    profiles: [{
                        rtsp: validUrl,
                        name: "Main Stream",
                        resolution: "Unknown",
                        codec: "Unknown"
                    }]
                };
            } else {
                return res.status(400).json({
                    error: `Connection Failed. ONVIF Auth Error AND RTSP Probe failed. Check password special characters.`
                });
            }
        }

        const mainProfile = data.profiles[0];
        const subProfile = (data.profiles.length > 1) ? data.profiles[data.profiles.length - 1] : mainProfile;
        const info = data.info || {};

        const newCam = {
            id: `cam_${ip.replace(/\./g, '_')}`,
            ip: ip,
            user: user,
            pass: pass,

            manufacturer: info.manufacturer || "Generic",
            model: info.model || "Unknown",
            serial: info.serialNumber || "",
            firmware: info.firmwareVersion || "",
            discoveryMethod: method,

            rtspMain: mainProfile.rtsp,
            rtspSub: subProfile.rtsp,
            rtsp: mainProfile.rtsp,

            streams: data.profiles.map(p => ({
                resolution: p.resolution,
                codec: p.codec,
                url: p.rtsp,
                type: (p === mainProfile) ? "Main" : "Sub"
            })),

            connected: true,
            enabled: true
        };

        const cams = CameraService.loadConfig();
        if (cams.find(c => c.ip === ip)) return res.status(409).json({ error: "Camera IP already exists" });

        cams.push(newCam);
        CameraService.saveConfig(cams); // This triggers Go2RTC Sync

        res.json({ status: "ok", camera: newCam, message: `Added via ${method}` });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const cams = CameraService.loadConfig();
        const filtered = cams.filter(c => c.id !== req.params.id);
        CameraService.saveConfig(filtered);
        res.json({ status: "ok" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/config", async (req, res) => {
    const merged = await CameraService.getFullStatus();
    res.json(merged);
});
router.post("/config", async (req, res) => {
    CameraService.saveConfig(req.body);
    res.json({ status: "ok" });
});

module.exports = router;
