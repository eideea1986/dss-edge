const express = require('express');
const router = express.Router();
const https = require('https');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const Location = require('../database/models/Location');
const tunnelManager = require('../utils/tunnelManager');

router.get("/stream", async (req, res) => {
    const { locationId, cameraId, timestamp } = req.query; // timestamp in seconds or ms
    console.log(`[Playback] REQUEST: ${locationId} / ${cameraId} / ${timestamp}`);

    try {
        const location = await Location.findOne({ locationId });
        if (!location) return res.status(404).end();

        // --- NON-TRASSIR LOCATIONS (EDGE NVR) ---
        if (location.manufacturer !== 'TRASSIR') {

            // Prioritize Direct/VPN connection over Tunnel
            let targetIp = null;
            let targetPort = 8080; // Default Edge PORT

            // HARDCODED VPN1 LOGIC FOR LOC001 (Deployment Specific)
            // In a full dynamic system, this IP should be read from the DB's WireGuard allocation table.
            if (locationId === 'LOC001') {
                targetIp = "10.100.0.3";
                console.log(`[Playback] Forcing VPN1 IP for ${locationId}: ${targetIp}`);
            }
            else if (location.vpnIp) targetIp = location.vpnIp;
            else if (location.ip) targetIp = location.ip;
            else if (location.tunnelApiPort) {
                targetIp = "127.0.0.1";
                targetPort = location.tunnelApiPort;
            }

            if (targetIp) {
                console.log(`[Playback] Streaming from ${targetIp}:${targetPort} (VPN/Direct)...`);

                // Construct Edge Playback URL
                // Note: Edge stores timestamps in MS (?) or Seconds?
                // Usually Edge expects 'start' query param.
                const edgeUrl = `http://${targetIp}:${targetPort}/api/playback/mjpeg/${cameraId}?start=${timestamp}`;

                try {
                    const response = await axios({
                        method: 'get',
                        url: edgeUrl,
                        responseType: 'stream',
                        timeout: 5000 // Timeout for connect, stream is infinite
                    });

                    res.writeHead(response.status, response.headers);
                    response.data.pipe(res);
                    return;
                } catch (e) {
                    console.error(`[Playback] Proxy Error (${targetIp}): ${e.message}`);
                    return res.status(502).send("Upstream Unreachable");
                }
            } else {
                console.error(`[Playback] No reachable IP for ${locationId}`);
                return res.status(502).send("Location Offline");
            }
        }

        // --- TRASSIR LOGIC (Existing) ---
        if (location.manufacturer === 'TRASSIR') {
            const token = uuidv4();
            const PUBLIC_IP = "194.107.163.227";
            const targetUrl = `http://${PUBLIC_IP}:8091/api/ingest/push/${token}`;

            let unixTs;
            const tsRaw = String(timestamp);
            if (!isNaN(tsRaw) && tsRaw.length >= 10) {
                const tsNum = Number(tsRaw);
                unixTs = tsNum > 10000000000 ? Math.floor(tsNum / 1000) : tsNum;
            } else {
                unixTs = Math.floor(new Date(timestamp).getTime() / 1000);
            }
            if (isNaN(unixTs)) unixTs = Math.floor(Date.now() / 1000) - 3600;

            const microTs = Math.floor(unixTs * 1000000);
            const nvrPort = location.port || 8070;

            const cameraUrl = `https://${location.ip}:${nvrPort}/screenshot?channel=${cameraId}&timestamp=${microTs}`;

            const cmdPayload = {
                type: "TRASSIR_SNAPSHOTS",
                payload: {
                    targetUrl: targetUrl,
                    cameraUrl: cameraUrl,
                    locationId: locationId,
                    type: "TRASSIR_SNAPSHOTS",
                    nvrUser: location.user || "dispecerat",
                    nvrPass: location.pass || "TEAMS_DSS_2k25!",
                    cameraId: cameraId
                }
            };

            await Location.updateOne({ locationId }, { $push: { commandQueue: cmdPayload } });

            // Try Tunnel
            const apiTunnelPort = location.tunnelApiPort;
            if (apiTunnelPort) {
                const tunnelUrl = `http://127.0.0.1:${apiTunnelPort}/push/start`;
                axios.post(tunnelUrl, cmdPayload.payload, { timeout: 3000 }).catch(e => { });
            }

            res.writeHead(200, {
                'Content-Type': 'multipart/x-mixed-replace; boundary=myboundary',
                'Cache-Control': 'no-cache',
                'Connection': 'close'
            });

            let attempts = 0;
            const http = require('http');
            const pollStream = setInterval(() => {
                attempts++;
                if (attempts > 30) {
                    clearInterval(pollStream);
                    if (!res.writableEnded) res.end();
                    return;
                }

                http.get(`http://127.0.0.1:8091/api/ingest/watch/${token}`, (watchRes) => {
                    if (watchRes.statusCode === 200) {
                        clearInterval(pollStream);
                        watchRes.pipe(res);
                        watchRes.on('end', () => res.end());
                    } else {
                        watchRes.resume();
                    }
                }).on('error', () => { });
            }, 1000);

            req.on('close', () => clearInterval(pollStream));

        } else {
            res.status(501).send("Not supported");
        }
    } catch (err) {
        console.error("[Playback] Error:", err);
        if (!res.headersSent) res.status(500).end();
    }
});

module.exports = router;
