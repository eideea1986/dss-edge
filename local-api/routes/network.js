const express = require("express");
const router = express.Router();
const NetworkService = require("../services/NetworkService");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

router.get("/config", (req, res) => {
    try {
        const runtime = NetworkService.getRuntimeInterfaces();
        const availableInterfaces = runtime.map(rt => {
            const cfg = NetworkService.getNetplanConfig(rt.interface);
            return {
                interface: rt.interface,
                mediaType: rt.interface.startsWith('w') ? 'Wireless' : 'Ethernet',
                mac: rt.mac,
                mode: cfg.mode,
                // Priority Logic: Config > Runtime
                ip: (cfg.mode === 'manual' && cfg.ip) ? cfg.ip : rt.ip,
                netmask: (cfg.mode === 'manual' && cfg.netmask) ? cfg.netmask : NetworkService.cidrToNetmask(rt.cidr),
                gateway: (cfg.mode === 'manual' && cfg.gateway) ? cfg.gateway : (rt.gateway || ""),
                dns1: (cfg.mode === 'manual' && cfg.dns1) ? cfg.dns1 : (rt.dns1 || ""),
                dns2: (cfg.mode === 'manual' && cfg.dns2) ? cfg.dns2 : (rt.dns2 || "")
            };
        });

        res.json({
            edgeName: NetworkService.getEdgeName(),
            availableInterfaces
        });
    } catch (e) {
        console.error("Network Config Error:", e);
        res.status(500).json({ error: e.message });
    }
});

router.get("/all", (req, res) => {
    exec("ip -4 addr show", (err, stdout) => {
        const safeStdout = stdout || "";
        const getIp = (iface) => {
            const re = new RegExp(`${iface}.*?inet\\s+([0-9.]+)\\/`, 's');
            const m = safeStdout.match(re);
            return m ? m[1] : "";
        };

        const wg0_ip = getIp("wg0");
        const wg1_ip = getIp("wg1");

        const readWg = (iface) => {
            try {
                const p = `/etc/wireguard/${iface}.conf`;
                if (!fs.existsSync(p)) return null;
                const c = fs.readFileSync(p, 'utf8');
                return {
                    address: (c.match(/Address\s*=\s*(.*)/i) || [])[1]?.trim(),
                    privateKey: (c.match(/PrivateKey\s*=\s*(.*)/i) || [])[1]?.trim(),
                    serverPubKey: (c.match(/PublicKey\s*=\s*(.*)/i) || [])[1]?.trim(),
                    endpoint: (c.match(/Endpoint\s*=\s*(.*)/i) || [])[1]?.trim(),
                    allowedIps: (c.match(/AllowedIPs\s*=\s*(.*)/i) || [])[1]?.trim()
                };
            } catch (e) { return null; }
        };

        const wg0_cfg = readWg("wg0");
        const wg1_cfg = readWg("wg1");

        let dispatchUrl = "";
        try {
            const dPath = path.join(__dirname, "../../event-engine/dispatch.json");
            if (fs.existsSync(dPath)) {
                dispatchUrl = JSON.parse(fs.readFileSync(dPath)).dispatchUrl;
            }
        } catch (e) { }

        res.json({
            vpn_status: wg0_ip ? `Connected (${wg0_ip})` : "Disconnected",
            vpn_ip: wg0_ip,
            wg0_status: wg0_ip ? "Connected" : "Disconnected",
            wg0_address: wg0_cfg?.address || "",
            wg0_privateKey: wg0_cfg?.privateKey || "",
            wg0_serverPubKey: wg0_cfg?.serverPubKey || "",
            wg0_endpoint: wg0_cfg?.endpoint || "",
            wg0_allowedIps: wg0_cfg?.allowedIps || "",
            wg1_status: wg1_ip ? "Connected" : "Disconnected",
            wg1_ip: wg1_ip,
            wg1_address: wg1_cfg?.address || "",
            wg1_privateKey: wg1_cfg?.privateKey || "",
            wg1_serverPubKey: wg1_cfg?.serverPubKey || "",
            wg1_endpoint: wg1_cfg?.endpoint || "",
            wg1_allowedIps: wg1_cfg?.allowedIps || "",
            dispatchUrl: dispatchUrl
        });
    });
});

router.post("/config", (req, res) => {
    const cfg = req.body;
    if (cfg.edgeName) NetworkService.saveEdgeName(cfg.edgeName);

    if (cfg.interface) {
        // Use the new NMCLI script
        const scriptPath = path.join(__dirname, "../apply_network_nm.sh");
        let cmd = "";
        if (cfg.mode === "dhcp") {
            cmd = `sudo bash ${scriptPath} ${cfg.interface} dhcp`;
        } else {
            const cidr = NetworkService.netmaskToCIDR(cfg.netmask);
            cmd = `sudo bash ${scriptPath} ${cfg.interface} manual ${cfg.ip}/${cidr} ${cfg.gateway} ${cfg.dns1} ${cfg.dns2}`;
        }

        exec(cmd, (err, stdout, stderr) => {
            if (err) console.error("[Network] Apply Failed:", stderr);
            else console.log("[Network] Applied:", stdout);
        });
    }

    res.json({ status: "ok" });
});

module.exports = router;
