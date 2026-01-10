const { spawn } = require("child_process");

module.exports = function validateRtsp(rtspUrl) {
    return new Promise((resolve) => {
        // -t 3 check 3 seconds. -f null discards output.
        // -rtsp_transport tcp enforces reliable connection
        const ff = spawn("ffmpeg", [
            "-v", "error",
            "-rtsp_transport", "tcp",
            "-i", rtspUrl,
            "-t", "3",
            "-f", "null", "-"
        ]);

        const timer = setTimeout(() => {
            ff.kill();
            resolve({ valid: false, error: "Timeout (5s)" });
        }, 8000);

        ff.on("exit", (code) => {
            clearTimeout(timer);
            if (code === 0) resolve({ valid: true });
            else resolve({ valid: false, error: `Exit Code ${code}` });
        });

        ff.on("error", (err) => {
            clearTimeout(timer);
            resolve({ valid: false, error: err.message });
        });
    });
};
