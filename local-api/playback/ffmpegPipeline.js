const { spawn } = require("child_process");

function createFfmpegArgs(listPath, offsetSec, durationSec = 90) {
    return [
        '-hide_banner', '-loglevel', 'error',

        // Input settings
        '-f', 'concat',
        '-safe', '0',
        '-ss', offsetSec.toFixed(3),
        '-i', listPath,

        // Stabilizare Timp (MSE Compatible)
        '-copyts',
        '-start_at_zero',
        '-avoid_negative_ts', 'make_zero',

        // Transcode settings (Optimized for quality & speed)
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-profile:v', 'baseline',
        '-level', '3.1',
        '-pix_fmt', 'yuv420p',
        '-g', '60', // 2 seconds at 30fps

        // Audio
        '-c:a', 'aac', '-ac', '2', '-ar', '44100', '-b:a', '128k',

        // Output format (Fragmented MP4 for streaming)
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-t', durationSec.toString(), // Stream limit to prevent "infinite" buffer logic issues
        '-f', 'mp4',

        // Output to pipe
        'pipe:1'
    ];
}

function startFfmpeg(listPath, offsetSec) {
    const args = createFfmpegArgs(listPath, offsetSec);
    const ffmpeg = spawn('ffmpeg', args);

    ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        // Ignore non-critical warnings
        if (!msg.includes('deprecated') && !msg.includes('libswresample')) {
            console.error(`[FFMPEG PB] ${msg.trim()}`);
        }
    });

    return ffmpeg;
}

module.exports = { startFfmpeg };
