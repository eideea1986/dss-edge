const express = require("express");
const router = express.Router();
const os = require("os");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");
const http = require("http");

const net = require("net");

// Helper to check if port is open
function checkPort(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.on('error', () => { resolve(false); });
        socket.connect(port, '127.0.0.1');
    });
}

// GET /services - Returns status of all critical services
router.get("/services", async (req, res) => {
    const serviceDefinitions = [
        { name: "go2rtc", label: "Go2RTC Video Engine", details: "Ports 1984 (API), 8554 (RTSP)", ports: [1984, 8554], critical: true },
        { name: "local-api", label: "Local API", details: "Port 8080 (Web Interface)", ports: [8080], critical: true },
        { name: "recorder", label: "Recorder Service", details: "Port 5003 (Recording Engine)", ports: [5003], critical: true },
        { name: "camera-manager", label: "Camera Manager", details: "Port 5002 (RTSP Proxy)", ports: [5002], critical: false },
        { name: "event-engine", label: "Event Engine", details: "Motion Detection & AI", ports: [], critical: false }
    ];

    const serviceStatuses = await Promise.all(serviceDefinitions.map(async (svc) => {
        let status = "Running";

        if (svc.ports.length > 0) {
            const portChecks = await Promise.all(svc.ports.map(p => checkPort(p)));
            const allPortsOpen = portChecks.every(result => result);
            status = allPortsOpen ? "Running" : "Stopped";
        }

        return {
            name: svc.name,
            label: svc.label,
            details: svc.details,
            status,
            critical: svc.critical
        };
    }));

    res.json(serviceStatuses);
});

// Hardware Info Cache (TTL 1 min)
let hardwareCache = null;
let lastHardwareFetch = 0;

router.get("/hardware", async (req, res) => {
    if (hardwareCache && (Date.now() - lastHardwareFetch < 60000)) {
        return res.json(hardwareCache);
    }
    const info = {
        os: "Unknown",
        kernel: "Unknown",
        cpu: "Unknown",
        gpu: "Unknown",
        gpuLoad: 0,
        motherboard: "Unknown",
        ram: "Unknown",
        network: [],
        dns: []
    };
    const run = (cmd) => new Promise((resolve) => {
        exec(cmd, (err, stdout) => resolve(err ? "" : stdout.trim()));
    });
    try {
        const hostnamectl = await run("hostnamectl");
        const osMatch = hostnamectl.match(/Operating System:\s+(.*)/);
        const kernelMatch = hostnamectl.match(/Kernel:\s+(.*)/);
        if (osMatch) info.os = osMatch[1];
        if (kernelMatch) info.kernel = kernelMatch[1];
        const cpuInfo = await run("grep 'model name' /proc/cpuinfo | head -n 1");
        if (cpuInfo) info.cpu = cpuInfo.split(":")[1].trim();
        const gpuModel = await run("lspci | grep -i 'vga\\|3d' | cut -d ':' -f3 | head -n 1");
        info.gpu = gpuModel.trim() || "Integrated / Unknown";
        const vendor = await run("cat /sys/devices/virtual/dmi/id/board_vendor");
        const name = await run("cat /sys/devices/virtual/dmi/id/board_name");
        if (vendor || name) info.motherboard = `${vendor} ${name}`.trim();
        const ramTotal = os.totalmem() / (1024 * 1024 * 1024);
        info.ram = `${ramTotal.toFixed(1)} GB`;
        const ramData = await run("dmidecode -t memory");
        if (ramData) {
            const type = ramData.match(/Type:\s+(DDR\d+)/);
            const manufacturer = ramData.match(/Manufacturer:\s+([^\n]+)/);
            const speed = ramData.match(/Speed:\s+(\d+\s+MT\/s)/);
            let details = [];
            if (type) details.push(type[1]);
            if (speed) details.push(speed[1]);
            if (manufacturer && !manufacturer[1].includes("Unknown")) details.push(manufacturer[1]);
            if (details.length > 0) info.ram += ` (${details.join(", ")})`;
        }
        const netLinks = await run("ip -o link show");
        if (netLinks) {
            const lines = netLinks.split("\n");
            for (const line of lines) {
                const parts = line.split(": ");
                if (parts.length >= 2) {
                    const iface = parts[1];
                    if (iface === "lo") continue;
                    const mac = line.match(/link\/ether\s+([0-9a-f:]{17})/);
                    info.network.push({
                        name: iface,
                        mac: mac ? mac[1] : "N/A"
                    });
                }
            }
        }
        const resolveConf = await run("cat /etc/resolv.conf");
        const dnsMatches = resolveConf.matchAll(/nameserver\s+(.*)/g);
        for (const match of dnsMatches) {
            info.dns.push(match[1]);
        }
        hardwareCache = info;
        lastHardwareFetch = Date.now();
        res.json(info);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// General system status endpoint (root) with caching and safe storageMap handling
let statusCache = null;
let lastStatusFetch = 0;
const STATUS_TTL = 5000; // 5 seconds

// Disk info cache (30s TTL to reduce I/O blocking)
let diskCache = null;
let lastDiskCheck = 0;
const DISK_TTL = 30000; // 30 seconds

router.get("/", (req, res) => {
    if (statusCache && (Date.now() - lastStatusFetch < STATUS_TTL)) {
        return res.json(statusCache);
    }
    const rootDir = path.resolve(__dirname, "../../");
    const dirs = ["camera-manager", "event-engine", "recorder", "local-api", "orchestrator", "ota", "local-ui"];
    const status = {
        online: true,
        uptime: os.uptime(),
        // CPU load as percentage of total cores (capped at 100%)
        cpu: (() => {
            const cores = os.cpus().length;
            const loads = os.loadavg(); // [1,5,15 min]
            return loads.map(l => {
                const pct = Math.round((l / cores) * 100);
                return pct > 100 ? 100 : pct;
            });
        })(),
        ram: { total: os.totalmem(), free: os.freemem() },
        modules: {},
        storageMap: false,
        ffmpeg: "Installed"
    };
    dirs.forEach(d => {
        const p = path.join(rootDir, d);
        if (fs.existsSync(p)) {
            status.modules[d] = fs.existsSync(path.join(p, "node_modules"));
        }
    });
    const mapPath = path.join(rootDir, "recorder/storage_map.json");
    status.storageMap = fs.existsSync(mapPath);

    // Use cached disk info if fresh
    if (!diskCache || (Date.now() - lastDiskCheck > DISK_TTL)) {
        try {
            const dfOutput = execSync(`df -h ${rootDir}`, { timeout: 1000 }).toString();
            const lines = dfOutput.split("\n");
            if (lines.length >= 2) {
                const parts = lines[1].trim().split(/\s+/);
                if (parts.length >= 5) {
                    diskCache = {
                        usedPercent: parseInt(parts[4].replace("%", "")),
                        avail: parts[3],
                        used: parts[2],
                        total: parts[1]
                    };
                    lastDiskCheck = Date.now();
                }
            }
        } catch (e) {
            console.error("df command failed", e);
        }
    }
    status.disk = diskCache || { usedPercent: 0, avail: "N/A", used: "N/A", total: "N/A" };

    statusCache = status;
    lastStatusFetch = Date.now();
    res.json(status);
});

router.post("/restart-service", (req, res) => {
    res.json({ status: "ok", message: "Service restart initiated" });
    setTimeout(() => {
        exec("sudo systemctl restart dss-edge", (error) => {
            if (error) console.error(`Restart Service Error: ${error}`);
        });
    }, 1000);
});

router.post("/reboot", (req, res) => {
    res.json({ status: "ok", message: "System reboot initiated" });
    setTimeout(() => {
        exec("sudo reboot", (error) => {
            if (error) console.error(`Reboot Error: ${error}`);
        });
    }, 1000);
});

router.post("/fix-deps", (req, res) => {
    const installScript = path.resolve(__dirname, "../../install_edge.sh");
    res.json({ status: "started", message: "Running npm install on all modules..." });
    exec(`bash ${installScript}`, (err, stdout, stderr) => {
        const log = path.join(__dirname, "../../install_fix.log");
        const out = `--- FIX LOG ${new Date().toISOString()} ---\nERR: ${err ? err.message : 'none'}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}\n`;
        fs.appendFileSync(log, out);
    });
});

router.get("/logs", (req, res) => {
    res.send("Logs temporarily unavailable in robust mode.");
});

module.exports = router;
