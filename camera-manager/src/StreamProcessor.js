const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class StreamProcessor extends EventEmitter {
    constructor() {
        super();
        this.processes = {};
        this.latestFrames = {};
    }

    startIngest(camera) {
        if (this.processes[camera.id]) return;

        console.log(`[StreamProcessor] Starting Live Feed via Go2RTC: ${camera.id}`);
        // Consume from Local Go2RTC (Low Stream) to save bandwidth/connections
        const rtspUri = `rtsp://127.0.0.1:8554/${camera.id}_low`;

        const ffmpegArgs = [
            '-rtsp_transport', 'tcp',
            '-i', rtspUri,
            '-f', 'image2',
            '-vf', 'fps=1', // 1 FPS este suficient pentru analiză AI în plan secund (economisește 50% CPU)
            '-update', '1',
            '-'
        ];

        const proc = spawn('ffmpeg', ffmpegArgs);
        this.processes[camera.id] = proc;

        let frameBuffer = Buffer.alloc(0);

        proc.stdout.on('data', (chunk) => {
            frameBuffer = Buffer.concat([frameBuffer, chunk]);

            // Căutăm antetul JPEG (FF D8 ... FF D9)
            let start = frameBuffer.indexOf(Buffer.from([0xFF, 0xD8]));
            let end = frameBuffer.indexOf(Buffer.from([0xFF, 0xD9]));

            if (start !== -1 && end !== -1 && end > start) {
                const frame = frameBuffer.slice(start, end + 2);
                frameBuffer = frameBuffer.slice(end + 2);

                this.latestFrames[camera.id] = frame;
                this.emit('frame', { camId: camera.id, buffer: frame });
            }
        });

        proc.on('exit', () => {
            console.log(`[StreamProcessor] Live Feed Lost for ${camera.id}. Restarting in 30s...`);
            delete this.processes[camera.id];
            setTimeout(() => this.startIngest(camera), 30000);
        });
    }

    getLatestFrame(camId) {
        return this.latestFrames[camId];
    }
}

module.exports = new StreamProcessor();
