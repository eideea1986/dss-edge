const { spawn } = require('child_process');

function spawnFFmpeg(concatFile, seekSeconds, speed = 1, format = 'mjpeg') {
    const args = [
        "-readrate", speed.toFixed(2),
        "-f", "concat",
        "-safe", "0",
        "-i", concatFile,
        "-ss", seekSeconds.toFixed(3)
    ];

    if (format === 'mjpeg') {
        const filters = speed !== 1
            ? `setpts=PTS/${speed},format=yuvj420p` // MJPEG uses yuvj420p typically
            : "format=yuvj420p";

        args.push(
            "-vf", filters,
            "-c:v", "mjpeg",
            "-q:v", "5",         // Quality (2-31, lower is better. 5 is good/fast)
            "-f", "mpjpeg",      // Multipart MJPEG format
            "-boundary_tag", "ffmpeg",
            "pipe:1"
        );
    } else {
        // Fallback or explicit MPEG-TS (for HLS/Go2RTC if needed)
        const filters = speed !== 1
            ? `setpts=PTS/${speed},format=yuv420p`
            : "format=yuv420p";

        args.push(
            "-vf", filters,
            "-c:v", "libx264",
            "-preset", "superfast",
            "-tune", "zerolatency",
            "-g", "50", "-keyint_min", "25", "-sc_threshold", "0",
            "-b:v", "2000k", "-maxrate", "3000k", "-bufsize", "8000k",
            "-an",
            "-f", "mpegts",
            "pipe:1"
        );
    }

    console.log(`[FFmpegPipeline] Speed=${speed} Format=${format} Args: ${args.join(' ')}`);

    const ffmpeg = spawn("ffmpeg", args, {
        stdio: ["ignore", "pipe", "pipe"]
    });

    ffmpeg.stderr.on("data", d => {
        const msg = d.toString();
        if (msg.includes("Error") || msg.includes("fatal")) {
            console.error(`[FFmpeg Error] ${msg}`);
        }
    });

    return ffmpeg;
}

module.exports = { spawnFFmpeg };
