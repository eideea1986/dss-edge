const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

class NetworkService {
    constructor() {
        this.edgeConfigPath = path.join(__dirname, "../../config/edge.json");
    }

    // RUNTIME INFO
    getRuntimeInterfaces() {
        try {
            const data = JSON.parse(execSync('ip -j addr show').toString());

            // Get Routes for Gateway
            let routes = [];
            try { routes = JSON.parse(execSync('ip -j route show default').toString()); } catch (e) { }

            return data
                .filter(d => !d.ifname.startsWith('lo') && !d.ifname.startsWith('docker') && !d.ifname.startsWith('veth'))
                .map(d => {
                    const v4 = d.addr_info.find(a => a.family === 'inet');

                    const route = routes.find(r => r.dev === d.ifname);
                    const gateway = route ? route.gateway : "";

                    // Runtime DNS - Try resolvectl (systemd-resolved) first
                    let dns1 = "", dns2 = "";
                    try {
                        const res = execSync(`resolvectl status ${d.ifname}`, { timeout: 1000, stdio: 'pipe' }).toString();
                        const dnsMatch = res.match(/DNS Servers:\s*([0-9. ]+)/);
                        if (dnsMatch) {
                            const ips = dnsMatch[1].trim().split(/\s+/);
                            dns1 = ips[0] || "";
                            dns2 = ips[1] || "";
                        }
                    } catch (e) { }

                    // If resolvectl empty, try nmcli runtime
                    if (!dns1) {
                        try {
                            const nmOut = execSync(`nmcli -t -f IP4.DNS device show ${d.ifname}`, { timeout: 1000, stdio: 'pipe' }).toString();
                            const lines = nmOut.split('\n').filter(l => l.trim().length > 0);
                            if (lines.length > 0) dns1 = lines[0].replace('IP4.DNS:', '').trim();
                            if (lines.length > 1) dns2 = lines[1].replace('IP4.DNS:', '').trim();
                        } catch (e) { }
                    }

                    return {
                        interface: d.ifname,
                        ip: v4 ? v4.local : "",
                        cidr: v4 ? v4.prefixlen : 24,
                        mac: d.address,
                        gateway,
                        dns1,
                        dns2
                    };
                });
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    // CONFIGURATION (From NetworkManager)
    getNetplanConfig(iface) {
        let config = { mode: "dhcp", ip: "", netmask: "", gateway: "", dns1: "", dns2: "" };

        try {
            // Iterate all connections to find matches by interface-name
            const uuids = execSync(`nmcli -g UUID con show`).toString().trim().split('\n').filter(Boolean);

            for (const uuid of uuids) {
                try {
                    // Check interface name
                    const ifName = execSync(`nmcli -g connection.interface-name con show ${uuid}`, { stdio: 'pipe' }).toString().trim();

                    if (ifName === iface) {
                        // FOUND MATCHING CONNECTION
                        const method = execSync(`nmcli -g ipv4.method con show ${uuid}`, { stdio: 'pipe' }).toString().trim();

                        // OGLINDA REALITATII:
                        if (method === 'manual') {
                            config.mode = 'manual';

                            const ipStr = execSync(`nmcli -g ipv4.addresses con show ${uuid}`, { stdio: 'pipe' }).toString().trim();
                            // Handle multiple IPs? "192.168.1.50/24, 10.0.0.1/8"
                            const firstIp = ipStr.split(',')[0];
                            if (firstIp.includes('/')) {
                                const p = firstIp.split('/');
                                config.ip = p[0];
                                config.netmask = this.cidrToNetmask(p[1]);
                            } else {
                                config.ip = firstIp;
                            }

                            config.gateway = execSync(`nmcli -g ipv4.gateway con show ${uuid}`, { stdio: 'pipe' }).toString().trim();

                            const dnsStr = execSync(`nmcli -g ipv4.dns con show ${uuid}`, { stdio: 'pipe' }).toString().trim();
                            const d = dnsStr.split(',');
                            config.dns1 = d[0] || "";
                            config.dns2 = d[1] || "";

                            return config; // Return immediately on first manual match
                        } else {
                            // It is Auto/DHCP
                            config.mode = 'dhcp';
                            return config;
                        }
                    }
                } catch (innerE) { }
            }
        } catch (e) {
            console.error("NM Config Read Error:", e.message);
        }
        return config;
    }

    cidrToNetmask(bits) {
        let mask = 0xffffffff << (32 - parseInt(bits));
        return [(mask >>> 24) & 255, (mask >>> 16) & 255, (mask >>> 8) & 255, mask & 255].join('.');
    }

    netmaskToCIDR(mask) {
        if (!mask) return 24;
        return mask.split('.').reduce((c, p) => c + (Number(p).toString(2).match(/1/g) || []).length, 0);
    }

    getEdgeName() {
        try {
            if (fs.existsSync(this.edgeConfigPath)) {
                return JSON.parse(fs.readFileSync(this.edgeConfigPath, "utf8")).name || "DSS-SMART GUARD";
            }
        } catch (e) { }
        return "DSS-SMART GUARD";
    }

    saveEdgeName(name) {
        try {
            let config = {};
            if (fs.existsSync(this.edgeConfigPath)) config = JSON.parse(fs.readFileSync(this.edgeConfigPath, "utf8"));
            config.name = name;
            fs.writeFileSync(this.edgeConfigPath, JSON.stringify(config, null, 2));
        } catch (e) { }
    }
}

module.exports = new NetworkService();
