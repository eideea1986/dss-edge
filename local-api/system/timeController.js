const { exec } = require('child_process');

const getSystemTime = (req, res) => {
    exec('timedatectl', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            // Fallback to minimal info if timedatectl fails
            return res.json({
                localTime: new Date().toString(),
                utcTime: new Date().toISOString(),
                timezone: 'Unknown',
                offset: new Date().getTimezoneOffset()
            });
        }

        // Parse timedatectl output
        const lines = stdout.split('\n');
        const info = {};
        lines.forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join(':').trim();
                info[key] = value;
            }
        });

        res.json({
            raw: info,
            timezone: info['Time zone'] || 'Unknown',
            localTime: info['Local time'],
            serverTimestamp: Date.now() // Critical for sync
        });
    });
};

const setTimezone = (req, res) => {
    const { timezone } = req.body;
    // Basic validation to prevent injection
    if (!timezone || !/^[a-zA-Z]+\/[a-zA-Z_]+$/.test(timezone)) {
        return res.status(400).send("Invalid timezone format");
    }

    exec(`timedatectl set-timezone ${timezone}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error setting timezone: ${stderr}`);
            return res.status(500).send("Failed to set timezone");
        }
        res.json({ success: true, message: `Timezone set to ${timezone}` });
    });
};

const getTimezones = (req, res) => {
    exec('timedatectl list-timezones', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            // Fallback
            return res.json(["UTC", "Europe/Bucharest", "Europe/London", "America/New_York"]);
        }
        res.json(stdout.split('\n').filter(l => l.trim().length > 0));
    });
};

module.exports = { getSystemTime, setTimezone, getTimezones };
