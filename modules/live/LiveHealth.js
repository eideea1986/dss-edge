/**
 * LiveHealth - Watchdog for Live Streams
 */
const { exec } = require('child_process');

class LiveHealth {
    /**
     * Check if a stream is reachable in go2rtc
     */
    static async checkGo2RTC(streamName) {
        return new Promise((resolve) => {
            exec(`curl -s --max-time 2 http://127.0.0.1:1984/api/streams`, (err, stdout) => {
                if (err || !stdout) return resolve(false);
                try {
                    const data = JSON.parse(stdout);
                    // Check if stream exists and has consumers or is active
                    const stream = data[streamName];
                    if (!stream) return resolve(false);
                    // If producers list is not empty, it's alive
                    resolve(stream.producers && stream.producers.length > 0);
                } catch (e) {
                    resolve(false);
                }
            });
        });
    }

    /**
     * Verify FFmpeg process is producing output (stale check)
     */
    static isStale(lastFrameAt, timeout = 15000) {
        return (Date.now() - lastFrameAt) > timeout;
    }
}

module.exports = LiveHealth;
