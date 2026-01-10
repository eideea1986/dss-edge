const express = require("express");
const router = express.Router();
const onvif = require("node-onvif");
const net = require("net");
const os = require("os");

let scanInProgress = false;

router.get("/scan", async (req, res) => {
    // Handling POST-like body in GET or query param, or just auto-detect
    // Settings.js calls POST /discovery/scan usually, but let's support both or check route definition
    // Actually Settings.js calls POST, but this file defined router.get("/scan")... 
    // Wait, previous file view showed router.get("/scan"). Settings.js calls API.post("/discovery/scan").
    // I should fix the method to match Settings.js (POST) or handle both. 
    // I will change to router.use to handle both for safety, or just router.post.
    // The previous code was router.get. Settings.js sends POST. This might be why it worked partly (or didn't).
    // Let's use router.all or just match Settings.js (POST).
    handleScan(req, res);
});

router.post("/scan", async (req, res) => {
    handleScan(req, res);
});

async function handleScan(req, res) {
    if (scanInProgress) {
        return res.status(202).json({ status: "scanning", message: "Scan in progress" });
    }

    scanInProgress = true;
    const range = req.body?.range || req.query?.range || getLocalSubnet();
    console.log(`[Discovery] Starting Scan on ${range} (ONVIF + RTSP/554)...`);

    try {
        // Run ONVIF and TCP Scan in parallel
        const [onvifDevices, tcpDevices] = await Promise.all([
            probeOnvifSafe(),
            scanSubnet(range)
        ]);

        console.log(`[Discovery] ONVIF: ${onvifDevices.length}, TCP: ${tcpDevices.length}`);

        // Merge: ONVIF takes precedence
        const combined = [...onvifDevices];
        const onvifIps = new Set(onvifDevices.map(d => d.ip));

        tcpDevices.forEach(d => {
            if (!onvifIps.has(d.ip)) {
                combined.push(d);
            }
        });

        // Sort by IP
        combined.sort((a, b) => {
            const numA = a.ip.split('.').map(Number);
            const numB = b.ip.split('.').map(Number);
            for (let i = 0; i < 4; i++) { if (numA[i] !== numB[i]) return numA[i] - numB[i]; }
            return 0;
        });

        scanInProgress = false;
        res.json(combined);
    } catch (e) {
        console.error("[Discovery] Error:", e);
        scanInProgress = false;
        res.status(500).json({ error: e.message });
    }
}

async function probeOnvifSafe() {
    try {
        console.log("[Discovery] Starting ONVIF Probe...");
        const devices = await onvif.startProbe();
        console.log(`[Discovery] Probe found ${devices.length} devices.`);

        // Enhance with Stream URI fetch (requires auth usually, but we try standard)
        // Actually, startProbe() only gives basic info. To get Stream URI we need to create a Device object and init it.
        // But we don't have the password yet! 
        // So we can only return the found info. The USER will provide password later.
        // However, we can extract more detailed metadata from the probe info if available.

        return devices.map(info => ({
            urn: info.urn,
            name: info.name,
            xaddrs: info.xaddrs[0],
            ip: extractIP(info.xaddrs[0]),
            model: info.hardware || "ONVIF Device",
            manufacturer: extractManufacturer(info) || "ONVIF Generic",
            type: "found",
            // We flag it as ONVIF capable so the UI knows it can try to Fetch Profiles later
            onvif: true
        }));
    } catch (e) {
        console.warn("[Discovery] ONVIF Probe warning:", e.message);
        return [];
    }
}

async function scanSubnet(cidr) {
    const devices = [];
    const base = cidr.replace("0/24", ""); // Simple hack for 192.168.1.0/24 -> 192.168.1.
    const promises = [];

    // Scan 1-254
    for (let i = 1; i < 255; i++) {
        const ip = base + i;
        promises.push(checkDevice(ip).then(dev => {
            if (dev) devices.push(dev);
        }));
    }

    await Promise.all(promises);
    return devices;
}

function checkDevice(ip) {
    return new Promise(async (resolve) => {
        // High priority: RTSP (554)
        const rtspOpen = await checkPort(ip, 554, 200);
        if (rtspOpen) {
            return resolve({
                name: `RTSP Device (${ip})`,
                ip: ip,
                port: 554,
                manufacturer: "Generic RTSP",
                hardware: "Unknown Camera",
                type: "found"
            });
        }

        // SDK Ports: 37777 (Dahua), 8000 (Hikvision)
        const dahuaOpen = await checkPort(ip, 37777, 200);
        if (dahuaOpen) {
            return resolve({
                name: `Dahua SDK Device (${ip})`,
                ip: ip,
                port: 37777,
                manufacturer: "Dahua",
                hardware: "SDK Device",
                type: "found"
            });
        }

        const hikOpen = await checkPort(ip, 8000, 200);
        if (hikOpen) {
            return resolve({
                name: `Hikvision SDK Device (${ip})`,
                ip: ip,
                port: 8000,
                manufacturer: "Hikvision",
                hardware: "SDK Device",
                type: "found"
            });
        }

        resolve(null);
    });
}

function checkPort(ip, port, timeout = 300) {
    return new Promise(resolve => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, ip);
    });
}

function getLocalSubnet() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                // Return estimated /24
                const parts = iface.address.split('.');
                parts.pop();
                return parts.join('.') + '.0/24';
            }
        }
    }
    return "192.168.1.0/24";
}

function extractIP(url) {
    try {
        const u = new URL(url);
        return u.hostname;
    } catch (e) { return "0.0.0.0"; }
}

function extractManufacturer(info) {
    if (info.manufacturer) {
        const m = info.manufacturer.toLowerCase();
        if (m.includes("hikvision")) return "Hikvision";
        if (m.includes("dahua")) return "Dahua";
        return info.manufacturer;
    }

    // Check name or hardware for keywords
    const combined = ((info.name || "") + " " + (info.hardware || "")).toLowerCase();
    if (combined.includes("hikvision") || combined.includes("ds-2") || combined.includes("ds-7")) return "Hikvision";
    if (combined.includes("dahua") || combined.includes("ipc-") || combined.includes("nvr")) return "Dahua";
    if (combined.includes("ezip")) return "Dahua"; // EZIP is Dahua rebranded
    if (combined.includes("axis")) return "Axis";
    if (combined.includes("trassir")) return "Trassir";

    return "ONVIF Generic";
}

module.exports = router;
