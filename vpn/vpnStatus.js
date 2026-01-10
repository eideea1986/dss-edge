const { exec } = require("child_process");

function getVPNStatus(callback) {
    // Check tailscale status via CLI
    exec("tailscale status --json", (err, stdout, stderr) => {
        if (err) {
            // Tailscale might not be installed or not running
            return callback({ online: false, error: "Tailscale not compliant" });
        }

        try {
            const data = JSON.parse(stdout);
            // 'Self' contains this node's info
            const self = data.Self;
            if (!self) {
                return callback({ online: false, status: "Offline" });
            }

            callback({
                online: self.Online,
                ip: self.TailscaleIPs ? self.TailscaleIPs[0] : null,
                hostname: self.HostName,
                exitNode: self.ExitNodeStatus || null
            });
        } catch (e) {
            callback({ online: false, error: "Parse error" });
        }
    });
}

module.exports = { getVPNStatus };
