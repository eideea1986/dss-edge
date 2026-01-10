const express = require("express");
const router = express.Router();
const { exec } = require("child_process");
const fs = require("fs");

const checkInterface = (iface) => ['wg0', 'wg1'].includes(iface) ? iface : 'wg0';

// Helper to parse WireGuard config
function readWgConfig(iface) {
    try {
        const path = `/etc/wireguard/${iface}.conf`;
        if (!fs.existsSync(path)) return null;
        const content = fs.readFileSync(path, 'utf8');

        const address = (content.match(/Address\s*=\s*(.*)/i) || [])[1]?.trim();
        const privateKey = (content.match(/PrivateKey\s*=\s*(.*)/i) || [])[1]?.trim();
        const publicKey = (content.match(/PublicKey\s*=\s*(.*)/i) || [])[1]?.trim();
        const endpoint = (content.match(/Endpoint\s*=\s*(.*)/i) || [])[1]?.trim();
        const allowedIps = (content.match(/AllowedIPs\s*=\s*(.*)/i) || [])[1]?.trim();

        return { address, privateKey, serverPubKey: publicKey, endpoint, allowedIps };
    } catch (e) { return null; }
}

// GET Status - Returns consolidated status AND Config
router.get("/status", (req, res) => {
    exec("ip -4 addr show", (err, stdout) => {
        // Fallback if IP command fails
        const safeStdout = stdout || "";

        const getIp = (iface) => {
            const re = new RegExp(`${iface}.*?inet\\s+([0-9.]+)\\/`);
            const m = safeStdout.match(re);
            return m ? m[1] : "";
        };

        const wg0_ip = getIp("wg0");
        const wg1_ip = getIp("wg1");

        // Read configs from disk
        const wg0_cfg = readWgConfig("wg0");
        const wg1_cfg = readWgConfig("wg1");

        res.json({
            // Legacy properties
            status: wg0_ip ? "Connected - WireGuard" : "Disconnected",
            ip: wg0_ip,

            // Explicit properties
            wg0_status: wg0_ip ? "Connected" : "Disconnected",
            wg0_ip: wg0_ip,
            wg0_config: wg0_cfg,

            wg1_status: wg1_ip ? "Connected" : "Disconnected",
            wg1_ip: wg1_ip,
            wg1_config: wg1_cfg
        });
    });
});

// Setup WireGuard (Generic)
router.post("/setup-wireguard", (req, res) => {
    const { interface: reqIface, privateKey, address, publicKey, endpoint, allowedIps, persistentKeepalive } = req.body;
    const iface = checkInterface(reqIface);
    const confFile = `/etc/wireguard/${iface}.conf`;

    if (!privateKey || !publicKey || !endpoint) {
        return res.status(400).json({ error: "Missing WireGuard parameters" });
    }

    // Build Config Content
    const content = `[Interface]
Address = ${address}
PrivateKey = ${privateKey}
# DNS = 8.8.8.8

[Peer]
PublicKey = ${publicKey}
Endpoint = ${endpoint}
AllowedIPs = ${allowedIps}
PersistentKeepalive = ${persistentKeepalive || 25}
`;

    try {
        console.log(`[VPN] Configuring ${iface}...`);
        fs.writeFileSync(confFile, content);

        // Reset Interface
        exec(`wg-quick down ${iface}; wg-quick up ${iface}`, (error, stdout, stderr) => {
            if (error) {
                // If 'down' failed because it wasn't up, ignore
                if (stderr.includes("is not a WireGuard interface")) {
                    exec(`wg-quick up ${iface}`, (e2, o2, s2) => {
                        if (e2) return res.status(500).json({ status: 'error', error: s2 });

                        // Check IP immediately
                        exec(`ip -4 addr show ${iface}`, (e3, o3) => {
                            res.json({ status: 'success', message: `${iface} Configured & Started`, output: o3 });
                        });
                    });
                    return;
                }
                console.error(`WG ${iface} Start Error:`, stderr);
                return res.status(500).json({ status: 'error', error: stderr });
            }
            res.json({ status: 'success', message: `${iface} Configured & Started` });
        });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Stop Interface
router.post("/stop-wireguard", (req, res) => {
    const iface = checkInterface(req.body.interface);
    exec(`wg-quick down ${iface}`, (err, stdout, stderr) => {
        if (err && !stderr.includes("is not")) return res.status(500).json({ error: stderr });
        res.json({ status: "success", message: `${iface} stopped` });
    });
});

module.exports = router;
