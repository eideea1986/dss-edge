const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
const { spawn } = require('child_process');

// Very permissive agent for local NVRs
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let activePushes = new Map();
let sidCache = new Map(); // nvrIp -> { sid, expires }

async function getNvrSid(nvrUrl, user, pass) {
    const now = Date.now();
    if (sidCache.has(nvrUrl)) {
        const cached = sidCache.get(nvrUrl);
        if (cached.expires > now) return cached.sid;
    }

    try {
        const loginUrl = `${nvrUrl}/login?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
        console.log(`[Push] Logging in to NVR: ${nvrUrl}`);
        const res = await axios.get(loginUrl, { timeout: 5000, httpsAgent });
        if (res.data && res.data.sid) {
            sidCache.set(nvrUrl, {
                sid: res.data.sid,
                expires: now + 20 * 60000 // 20 mins
            });
            return res.data.sid;
        }
    } catch (e) {
        console.error(`[Push] NVR Login failed: ${e.message}`);
    }
    return null;
}

router.post('/start', async (req, res) => {
    try {
        let body = req.body;
        console.log("[Push] Start Request Type:", typeof body);

        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) { console.warn("Body Parse Error", e); }
        } else if (typeof body === 'object') {
            // Already parsed
        }

        // Safer logging
        // console.log("[Push] Body keys:", Object.keys(body));

        const { targetUrl, cameraId, cameraUrl, nvrUser, nvrPass, locationId, type } = body;

        if (!targetUrl || !cameraId || !cameraUrl) {
            console.warn("[Push] Missing fields in start request");
            return res.status(400).send("Missing targetUrl, cameraId, or cameraUrl");
        }

        console.log(`[Push] Start received for ${locationId}: ${type} -> ${targetUrl}`);

        if (activePushes.has(targetUrl)) {
            console.log(`[Push] Stopping existing push for ${targetUrl}`);
            activePushes.get(targetUrl).stop();
        }

        if (type === 'TRASSIR_SNAPSHOTS') {
            console.log("[Push] Initiating Trassir Snapshot PUSH...");

            let isRunning = true;
            const stop = () => { isRunning = false; };
            activePushes.set(targetUrl, { stop });

            const { PassThrough } = require('stream');
            const stream = new PassThrough();

            axios({
                method: 'post',
                url: targetUrl,
                data: stream,
                headers: { 'Content-Type': 'multipart/x-mixed-replace; boundary=myboundary' },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }).catch(e => {
                console.error(`[Push] Backend Pipe Error: ${e.message}`);
                isRunning = false;
            });

            const FPS = 8;
            const INTERVAL = 1000 / FPS;

            // Reconstruct NVR base URL from cameraUrl if not provided
            // Default to the known NVR IP if parsing fails or for testing
            let nvrBase = "https://192.168.120.98:8070"; // Default NVR IP
            try {
                const parsedCameraUrl = new URL(cameraUrl.startsWith('http') ? cameraUrl : `http://localhost${cameraUrl}`);
                // Attempt to reconstruct NVR base from cameraUrl if it contains an IP/hostname and port
                if (parsedCameraUrl.hostname && parsedCameraUrl.port) {
                    nvrBase = `${parsedCameraUrl.protocol}//${parsedCameraUrl.hostname}:${parsedCameraUrl.port}`;
                }
            } catch (e) {
                console.warn(`[Push] Could not parse cameraUrl to determine NVR base, using default: ${e.message}`);
            }

            console.log(`[Push] Using NVR Base: ${nvrBase}`);

            let urlObj = new URL(cameraUrl.startsWith('http') ? cameraUrl : `http://localhost${cameraUrl}`);
            let playhead = parseInt(urlObj.searchParams.get('timestamp')) / 1000000;
            if (isNaN(playhead)) playhead = Math.floor(Date.now() / 1000) - 3600;

            const runLoop = async () => {
                let currentSid = null;
                while (isRunning) {
                    const loopStart = Date.now();

                    if (!currentSid) {
                        currentSid = await getNvrSid(nvrBase, nvrUser, nvrPass);
                        if (!currentSid) {
                            console.warn(`[Push] Failed to get NVR SID for ${nvrBase}. Retrying in 2s.`);
                        }
                    }

                    if (currentSid) {
                        const microTs = Math.floor(playhead * 1000000);
                        // Using localhost to avoid timeout
                        const fetchUrl = `${nvrBase}/screenshot?channel=${cameraId}&sid=${currentSid}&timestamp=${microTs}`;

                        try {
                            const frame = await axios.get(fetchUrl, {
                                responseType: 'arraybuffer',
                                timeout: 10000, // Increased timeout
                                httpsAgent
                            });

                            if (frame.status === 200 && frame.data.length > 100) {
                                if (microTs % 100 === 0) console.log(`[Push] Fetched frame ${frame.data.length} bytes for ${cameraId} at ${microTs}`);
                                stream.write(`--myboundary\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.data.length}\r\n\r\n`);
                                stream.write(frame.data);
                                stream.write('\r\n');
                                playhead += (1 / FPS);
                            } else {
                                console.warn(`[Push] Invalid frame status ${frame.status} or size ${frame.data?.length} for ${cameraId} at ${microTs}`);
                            }
                        } catch (e) {
                            console.error(`[Push] Fetch ERROR at playhead ${playhead} for ${cameraId}: ${e.message}`);
                            if (e.response?.status === 401) {
                                console.log("[Push] 401 Unauthorized from NVR, clearing SID to force re-login...");
                                currentSid = null; // Force re-login
                            }
                            // Small sleep on error to prevent hammering
                            await new Promise(r => setTimeout(r, 500));
                        }
                    } else {
                        await new Promise(r => setTimeout(r, 2000));
                    }

                    const delay = Math.max(0, INTERVAL - (Date.now() - loopStart));
                    await new Promise(r => setTimeout(r, delay));
                }
                stream.end();
                activePushes.delete(targetUrl);
            };

            runLoop();
            res.json({ status: "started", mode: "trassir-snapshots" });

        } else if (cameraUrl.startsWith('rtsp')) {
            // ... existing RTSP logic ...
            const ffmpegArgs = ['-rtsp_transport', 'tcp', '-i', cameraUrl, '-f', 'mpjpeg', '-boundary_tag', 'myboundary', '-q:v', '5', '-r', '10', '-'];
            const proc = spawn('ffmpeg', ffmpegArgs);
            axios({
                method: 'post',
                url: targetUrl,
                data: proc.stdout,
                headers: { 'Content-Type': 'multipart/x-mixed-replace; boundary=myboundary' },
                maxContentLength: Infinity, maxBodyLength: Infinity
            }).catch(e => console.error(`[Push] RTSP Pipe Error: ${e.message}`));
            activePushes.set(targetUrl, { stop: () => proc.kill() });
            res.json({ status: "started", mode: "ffmpeg-rtsp" });
        } else {
            res.status(400).json({ error: "Unsupported push type" });
        }
    } catch (e) {
        console.error(`[Push] Fatal: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

router.post('/stop', (req, res) => {
    const { targetUrl } = req.body;
    if (activePushes.has(targetUrl)) {
        activePushes.get(targetUrl).stop();
        activePushes.delete(targetUrl);
    }
    res.json({ status: "stopped" });
});

module.exports = router;
