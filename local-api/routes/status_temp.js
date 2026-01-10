const express = require("express");
const router = express.Router();
const os = require("os");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const http = require("http");

// Hardware Info Cache (TTL 1 min)
let hardwareCache = null;
let lastHardwareFetch = 0;

router.get("/hardware", async (req, res) => {
    // Return cached if fresh
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
        // OS & Kernel
        const hostnamectl = await run("hostnamectl");
        const osMatch = hostnamectl.match(/Operating System:\s+(.*)/);
        const kernelMatch = hostnamectl.match(/Kernel:\s+(.*)/);
        if (osMatch) info.os = osMatch[1];
        if (kernelMatch) info.kernel = kernelMatch[1];

        // CPU
        const cpuInfo = await run("grep 'model name' /proc/cpuinfo | head -n 1");
        if (cpuInfo) info.cpu = cpuInfo.split(":")[1].trim();

        // GPU
        const gpuModel = await run("lspci | grep -i 'vga\\|3d' | cut -d ':' -f3 | head -n 1");
        info.gpu = gpuModel.trim() || "Integrated / Unknown";

        info.gpuLoad = 0; // Simplified for now

        // Motherboard
        const vendor = await run("cat /sys/devices/virtual/dmi/id/board_vendor");
        const name = await run("cat /sys/devices/virtual/dmi/id/board_name");
        if (vendor || name) info.motherboard = `${vendor} ${name}`.trim();

        // RAM
        const ramTotal = os.totalmem() / (1024 * 1024 * 1024);
        info.ram = `${ramTotal.toFixed(1)} GB`;

        // Network
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
                        mac: mac ? mac[1] : "N/A",
                        brand: "Generic"
                    });
                }
            }
        }

        // DNS
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

router.get("/", (req, res) => {
    const rootDir = path.resolve(__dirname, "../../");
    const status = {
        online: true,
        uptime: os.uptime(),
        cpu: os.loadavg(),
        ram: {
            total: os.totalmem(),
            free: os.freemem()
        },
        ffmpeg: "Checking..."
    };
    exec("ffmpeg -version", (err, stdout) => {
        status.ffmpeg = err ? "Not found" : "Installed";
        res.json(status);
    });
});

module.exports = router;
