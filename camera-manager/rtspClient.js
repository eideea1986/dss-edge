const { spawn } = require("child_process");

function startRTSP(rtspUrl, onFrame, onError, transport = 'tcp', logger = console.log) {
    logger(`[RTSP] Connecting via ${transport.toUpperCase()}...`);
    // Using ffmpeg to extract frames as MJPEG stream
    const ffmpeg = spawn("ffmpeg", [
        "-rtsp_transport", transport, // 'tcp' or 'udp'
        "-probesize", "2M",          // Optimize probe for speed (was 32M)
        "-analyzeduration", "2M",    // Optimize duration for speed (was 10M)
        "-i", rtspUrl,
        "-vf", "fps=2,scale=640:-1", // 2 FPS to reduce backend load (Trassir NVR typically uses 2-4 fps for multi-view)
        "-f", "image2pipe",       // Pipe output
        "-vcodec", "mjpeg",       // MJPEG output (concatenated JPEGs)
        "-q:v", "15",             // Quality factor (15 = Faster encoding, OK for AI)
        "-"
    ]);

    let buffer = Buffer.alloc(0);

    let debugFrameCount = 0;
    ffmpeg.stdout.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        let offset = 0;
        while (true) {
            // Find Start of Image (SOI): FF D8
            const soi = buffer.indexOf(Buffer.from([0xFF, 0xD8]), offset);
            if (soi === -1) {
                // No start found, cleanup
                if (offset > 0) buffer = buffer.slice(offset);
                break;
            }

            // Find End of Image (EOI): FF D9
            const eoi = buffer.indexOf(Buffer.from([0xFF, 0xD9]), soi);
            if (eoi === -1) {
                // Incomplete
                if (soi > 0) buffer = buffer.slice(soi);
                break;
            }

            // Extract complete frame
            const frameData = buffer.slice(soi, eoi + 2);
            onFrame(frameData);

            debugFrameCount++;
            if (debugFrameCount % 50 === 0) logger(`[RTSP] Extracted ${debugFrameCount} frames. Last frame size: ${frameData.length} bytes.`);

            offset = eoi + 2;
        }

        if (offset > 0) {
            buffer = buffer.slice(offset);
        }
    });

    ffmpeg.stderr.on("data", (data) => {
        // Log valid FFmpeg errors/info to the logger
        const msg = data.toString().trim();
        if (msg) logger(`[FFmpeg] ${msg}`);
    });

    ffmpeg.on("close", (code) => {
        logger(`[FFmpeg] Process closed with code ${code}`);
        onError("RTSP closed");
    });

    ffmpeg.on("error", (err) => {
        logger(`[FFmpeg] Process error: ${err.message}`);
        onError(err);
    });

    return ffmpeg;
}

module.exports = { startRTSP };
