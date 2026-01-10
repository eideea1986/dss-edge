const os = require("os");
const { execSync } = require("child_process");

function getHealth() {
    let diskUsage = "N/A";
    let vpnIp = "N/A";

    try {
        // Linux/Unix command
        diskUsage = execSync("df -h / | tail -1 | awk '{print $5}'").toString().trim();
    } catch (e) { }

    // Tailscale check disabled in favor of SSH Tunnels
    // try {
    //     vpnIp = execSync("tailscale ip --4").toString().trim();
    // } catch (e) { }

    // Optionally check if tunnel is active (simple check if SSH established)
    // For now, leave as N/A or "Tunnel Active" if we could detect it. 
    // Dispatch will see it online via Heartbeat anyway.

    return {
        cpu: os.loadavg()[0].toFixed(2),
        ram: {
            total: os.totalmem(),
            free: os.freemem(),
            percent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(1) + "%"
        },
        disk: diskUsage,
        uptime: os.uptime(),
        vpn: vpnIp
    };
}

module.exports = { getHealth };
