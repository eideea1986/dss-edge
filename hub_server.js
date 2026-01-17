const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');
const si = require('systeminformation');

const app = express();
const PORT = 8080;

// --- HARDCODED DISPATCH URL (FALLBACK) ---
const DISPATCH_FALLBACK_URL = "http://192.168.133.8:8091";

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// LOG ALL REQUESTS TO DEBUG UI ISSUES
app.use((req, res, next) => {
    // console.log(`[API REQUEST] ${req.method} ${req.originalUrl}`);
    next();
});

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) return res.status(400).send({ error: "Invalid JSON" });
    next();
});

const CONFIG_DIR = path.join(__dirname, 'config');
const STATS_FILE = path.join(CONFIG_DIR, 'hub_stats.json');
const EVENTS_DB_FILE = path.join(CONFIG_DIR, 'events_db.json');
const NETWORK_FILE = path.join(CONFIG_DIR, 'network.json');
const AI_SERVERS_FILE = path.join(CONFIG_DIR, 'ai_servers.json');

fs.ensureDirSync(CONFIG_DIR);
const EVENTS_IMG_DIR = path.join(__dirname, 'public/events');
fs.ensureDirSync(EVENTS_IMG_DIR);
app.use('/events-img', express.static(EVENTS_IMG_DIR));

if (!fs.existsSync(EVENTS_DB_FILE)) fs.writeJsonSync(EVENTS_DB_FILE, []);
if (!fs.existsSync(STATS_FILE)) fs.writeJsonSync(STATS_FILE, { receivedCount: 0, distributedCount: 0, identifiedCount: 0, activeAI: 0 });

let hubStats = { receivedCount: 0, distributedCount: 0, identifiedCount: 0, activeAI: 0, active: true };
try { hubStats = { ...hubStats, ...fs.readJsonSync(STATS_FILE) }; } catch (e) { }

function saveStats() { fs.writeJson(STATS_FILE, hubStats, { spaces: 2 }).catch(e => { }); }

// --- API ROUTES ---

// Main Dashboard Aggregate
app.get('/api/hub/dashboard', async (req, res) => {
    try {
        const events = (await fs.readJson(EVENTS_DB_FILE).catch(() => []));
        const si_mem = await si.mem().catch(() => ({}));
        const si_load = await si.currentLoad().catch(() => ({}));

        res.json({
            ...hubStats,
            active: true, // CRITICAL FOR UI
            stats: hubStats,
            events: events.slice(0, 50),
            data: events.slice(0, 50),
            system: {
                status: "online",
                active: true,
                cpu: Math.round(si_load.currentLoad || 0),
                mem: Math.round((si_mem.active / si_mem.total) * 100 || 0),
                uptime: Math.round(process.uptime())
            },
            success: true
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dashboard/stats', (req, res) => res.json({ ...hubStats, active: true }));

app.get('/api/hub/event-log', async (req, res) => {
    try { res.json((await fs.readJson(EVENTS_DB_FILE)).slice(0, 100)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// System Status
app.get('/api/system/status', async (req, res) => {
    try {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        res.json({
            status: "online",
            active: true, // CRITICAL
            cpu: Math.round(cpu.currentLoad),
            mem: Math.round((mem.active / mem.total) * 100),
            uptime: Math.round(process.uptime())
        });
    } catch (e) { res.json({ status: "online", active: true, cpu: 0, mem: 0 }); }
});

// VPN Status
app.get('/api/vpn/status', (req, res) => res.json({
    connected: true,
    active: true, // CRITICAL
    interface: "wg1",
    ip: "10.200.0.205"
}));

// Network interfaces (UI crashes if empty)
app.get('/api/network', async (req, res) => {
    try {
        const interfaces = await si.networkInterfaces();
        const netObj = {};
        interfaces.forEach(iface => {
            netObj[iface.iface] = {
                ...iface,
                active: iface.operstate === 'up' || iface.ip4 !== '',
                status: iface.operstate === 'up' ? 'up' : 'down'
            };
        });
        // Fallback for eth0 if list is weird
        if (!netObj['eth0'] && !netObj['eno1']) {
            netObj['eth0'] = { active: true, ip4: "192.168.120.205", operstate: 'up' };
        }
        res.json(netObj);
    } catch (e) { res.json({ eth0: { active: true, ip4: "192.168.120.205" } }); }
});

// AI Servers
app.get('/api/ai-servers', async (req, res) => {
    try {
        let list = await fs.readJson(AI_SERVERS_FILE).catch(() => []);
        if (list.length === 0) list = [{ ip: "192.168.120.209", port: 5001, enabled: true, name: "AI Main" }];
        res.json(list.map(s => ({ ...s, active: s.enabled !== false })));
    } catch (e) { res.json([]); }
});

// ANALYZE (Core Logic)
app.post('/api/hub/analyze', async (req, res) => {
    try {
        hubStats.receivedCount++;
        saveStats();

        // 1. Origin
        let origin = (req.body && req.body.origin) ? req.body.origin : (req.headers['x-origin'] || 'unknown');

        // 2. AI Server
        let targetUrl = "http://192.168.120.209:5001";
        try {
            if (fs.existsSync(AI_SERVERS_FILE)) {
                const list = fs.readJsonSync(AI_SERVERS_FILE).filter(s => s.enabled);
                if (list.length > 0) targetUrl = `http://${list[0].ip}:${list[0].port || 5001}`;
            }
        } catch (e) { }

        // 3. Forward
        const aiResp = await axios.post(`${targetUrl}/detect`, req.body, { timeout: 15000 });
        hubStats.distributedCount++;

        const results = aiResp.data.detections || aiResp.data || [];
        const isPositive = Array.isArray(results) && results.length > 0;

        console.log(`[Hub] Analysis Result for ${origin}: ${isPositive ? "POSITIVE" : "NEGATIVE"} (${results.length})`);

        if (isPositive) {
            hubStats.identifiedCount++;

            // --- DISPATCH ---
            setTimeout(async () => {
                try {
                    let dispatchUrl = DISPATCH_FALLBACK_URL;
                    try {
                        if (fs.existsSync(NETWORK_FILE)) {
                            const net = fs.readJsonSync(NETWORK_FILE);
                            if (net.dispatchUrl) dispatchUrl = net.dispatchUrl;
                        }
                    } catch (e) { }

                    const payload = {
                        locationId: origin,
                        camId: req.body.camId,
                        cameraId: req.body.camId, // Compatibility
                        timestamp: Date.now(),
                        type: "ai_event",
                        detections: results,
                        image: req.body.image,
                        snapshot: req.body.image // Dispatch Requirement
                    };

                    await axios.post(`${dispatchUrl}/api/events`, payload, { timeout: 5000 });
                } catch (e) {
                    console.error(`[Hub] Dispatch FAILED: ${e.message}`);
                }
            }, 10);
        }
        saveStats();

        // 4. Local Log
        try {
            const eid = Date.now().toString();
            const img = `evt_${eid}.jpg`;
            if (req.body.image) fs.writeFile(path.join(EVENTS_IMG_DIR, img), req.body.image, 'base64').catch(() => { });

            const db = fs.readJsonSync(EVENTS_DB_FILE);
            db.unshift({
                id: eid, timestamp: Date.now(),
                nvrId: origin, origin: origin,
                camId: req.body.camId, cameraId: req.body.camId,
                analysisResult: isPositive ? "positive" : "negative",
                detections: results,
                image: `/events-img/${img}`,
                snapshot: `/events-img/${img}`
            });
            if (db.length > 200) db.length = 200;
            fs.writeJsonSync(EVENTS_DB_FILE, db);
        } catch (e) { }

        res.json({ success: true, detections: results });

    } catch (e) {
        console.error(`[Hub] Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`HUB API v4-UIMaster running on ${PORT}`));
