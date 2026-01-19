/**
 * ANTIGRAVITY :: CAMERA CONNECTION PLUS
 * 
 * Camera Metrics Collection + Prometheus Export
 * - fps_real
 * - rtp_jitter
 * - packet_loss
 * - rtsp_reconnects
 * - frame_latency
 */

const Redis = require('ioredis');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CAMERA_CONFIG = {
    PROFILE: 'camera-connection-plus',
    ENABLED: true,

    // Metrics
    METRICS: ['fps_real', 'rtp_jitter', 'packet_loss', 'rtsp_reconnects', 'frame_latency'],
    METRICS_PORT: 9103, // ANTIGRAVITY: --port-isolation enable
    METRICS_INTERVAL: 5000, // 5s collection interval

    // Redis
    REDIS_PREFIX: 'camera:metrics:',

    // Paths
    CONFIG_FILE: '/opt/dss-edge/config/cameras.json'
};

// ═══════════════════════════════════════════════════════════════════════════
// CAMERA METRICS COLLECTOR
// ═══════════════════════════════════════════════════════════════════════════

class CameraMetricsCollector {
    constructor() {
        this.redis = new Redis();
        this.metrics = new Map(); // cameraId -> metrics object
        this.reconnectCounts = new Map(); // cameraId -> reconnect count
    }

    async init() {
        console.log('[CameraMetrics] Initializing Camera Connection Plus...');
        console.log(`[CameraMetrics] Profile: ${CAMERA_CONFIG.PROFILE}`);
        console.log(`[CameraMetrics] Metrics: ${CAMERA_CONFIG.METRICS.join(', ')}`);

        // Start collection loop
        this.startCollection();

        // Start Prometheus server
        this.startPrometheusServer();

        // Subscribe to camera events
        this.subscribeToEvents();

        console.log('[CameraMetrics] Camera Connection Plus ACTIVE');
    }

    // Get camera list
    getCameras() {
        try {
            if (!fs.existsSync(CAMERA_CONFIG.CONFIG_FILE)) return [];
            return JSON.parse(fs.readFileSync(CAMERA_CONFIG.CONFIG_FILE, 'utf8'));
        } catch (e) {
            return [];
        }
    }

    // Collect metrics for a single camera using ffprobe
    async collectCameraMetrics(camera) {
        const cameraId = camera.id;
        const user = camera.credentials?.user || camera.user || 'admin';
        const pass = camera.credentials?.pass || camera.pass || 'admin';
        const rtspUrl = camera.streams?.main || camera.rtsp_main ||
            `rtsp://${user}:${pass}@${camera.ip}:554/cam/realmonitor?channel=1&subtype=0`;

        return new Promise((resolve) => {
            const startTime = Date.now();

            const args = [
                '-v', 'error',
                '-rtsp_transport', 'tcp',
                '-i', rtspUrl,
                '-select_streams', 'v:0',
                '-show_entries', 'stream=r_frame_rate,avg_frame_rate',
                '-show_entries', 'format=bit_rate',
                '-read_intervals', '%+#10', // Read 10 frames
                '-of', 'json',
                '-timeout', '5000000' // 5s timeout
            ];

            const proc = spawn('ffprobe', args, { timeout: 10000 });
            let output = '';
            let errorOutput = '';

            proc.stdout.on('data', (data) => {
                output += data.toString();
            });

            proc.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            proc.on('close', (code) => {
                const latency = Date.now() - startTime;

                let metrics = {
                    cameraId,
                    fps_real: 0,
                    rtp_jitter: 0,
                    packet_loss: 0,
                    rtsp_reconnects: this.reconnectCounts.get(cameraId) || 0,
                    frame_latency: latency,
                    connected: code === 0,
                    timestamp: Date.now()
                };

                if (code === 0 && output) {
                    try {
                        const data = JSON.parse(output);

                        // Extract FPS
                        if (data.streams && data.streams[0]) {
                            const fpsStr = data.streams[0].r_frame_rate || '0/1';
                            const [num, den] = fpsStr.split('/').map(Number);
                            metrics.fps_real = den > 0 ? Math.round(num / den) : 0;
                        }

                        // Estimate jitter from latency variance
                        const prevMetrics = this.metrics.get(cameraId);
                        if (prevMetrics) {
                            metrics.rtp_jitter = Math.abs(latency - prevMetrics.frame_latency);
                        }

                    } catch (e) {
                        // Parse error, keep defaults
                    }
                } else {
                    // Connection failed - increment reconnect counter
                    const current = this.reconnectCounts.get(cameraId) || 0;
                    this.reconnectCounts.set(cameraId, current + 1);
                    metrics.rtsp_reconnects = current + 1;

                    // Estimate packet loss based on failure
                    metrics.packet_loss = 100; // 100% if failed
                }

                this.metrics.set(cameraId, metrics);
                resolve(metrics);
            });

            proc.on('error', () => {
                resolve({
                    cameraId,
                    fps_real: 0,
                    rtp_jitter: 0,
                    packet_loss: 100,
                    rtsp_reconnects: (this.reconnectCounts.get(cameraId) || 0) + 1,
                    frame_latency: Date.now() - startTime,
                    connected: false,
                    timestamp: Date.now()
                });
            });
        });
    }

    // Alternative: Parse Go2RTC stats if available
    async collectFromGo2RTC(cameraId) {
        try {
            const response = await fetch(`http://127.0.0.1:1984/api/streams/${cameraId}`);
            if (!response.ok) return null;

            const data = await response.json();

            if (data.producers && data.producers[0]) {
                const producer = data.producers[0];
                return {
                    cameraId,
                    fps_real: producer.recv?.video?.fps || 0,
                    rtp_jitter: producer.recv?.video?.jitter || 0,
                    packet_loss: producer.recv?.video?.loss || 0,
                    rtsp_reconnects: producer.reconnects || 0,
                    frame_latency: producer.recv?.video?.latency || 0,
                    connected: true,
                    timestamp: Date.now()
                };
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    // Collection loop
    startCollection() {
        setInterval(async () => {
            const cameras = this.getCameras();

            for (const camera of cameras) {
                if (!camera.enabled) continue;

                // Try Go2RTC first (faster)
                let metrics = await this.collectFromGo2RTC(camera.id);

                // Fallback to ffprobe
                if (!metrics) {
                    metrics = await this.collectCameraMetrics(camera);
                }

                // Store in Redis
                await this.redis.set(
                    `${CAMERA_CONFIG.REDIS_PREFIX}${camera.id}`,
                    JSON.stringify(metrics),
                    'EX', 30 // 30s expiry
                );
            }

            // Publish aggregate metrics
            await this.publishAggregate();

        }, CAMERA_CONFIG.METRICS_INTERVAL);

        console.log(`[CameraMetrics] Collection started (every ${CAMERA_CONFIG.METRICS_INTERVAL}ms)`);
    }

    // Publish aggregate metrics
    async publishAggregate() {
        const aggregate = {
            total_cameras: this.metrics.size,
            connected: 0,
            disconnected: 0,
            avg_fps: 0,
            avg_latency: 0,
            total_reconnects: 0,
            timestamp: Date.now()
        };

        let fpsSum = 0;
        let latencySum = 0;

        for (const [id, m] of this.metrics) {
            if (m.connected) {
                aggregate.connected++;
                fpsSum += m.fps_real;
                latencySum += m.frame_latency;
            } else {
                aggregate.disconnected++;
            }
            aggregate.total_reconnects += m.rtsp_reconnects;
        }

        if (aggregate.connected > 0) {
            aggregate.avg_fps = Math.round(fpsSum / aggregate.connected);
            aggregate.avg_latency = Math.round(latencySum / aggregate.connected);
        }

        await this.redis.set(`${CAMERA_CONFIG.REDIS_PREFIX}aggregate`, JSON.stringify(aggregate));
    }

    // Subscribe to camera events
    subscribeToEvents() {
        const sub = new Redis();

        sub.subscribe('camera:connected', 'camera:disconnected', 'camera:reconnect', (err) => {
            if (!err) console.log('[CameraMetrics] Subscribed to camera events');
        });

        sub.on('message', (channel, message) => {
            try {
                const data = JSON.parse(message);

                if (channel === 'camera:reconnect') {
                    const current = this.reconnectCounts.get(data.cameraId) || 0;
                    this.reconnectCounts.set(data.cameraId, current + 1);
                }

                if (channel === 'camera:connected') {
                    // Reset reconnect count on successful connect
                    // (optional - depends on desired behavior)
                }

            } catch (e) { }
        });
    }

    // Prometheus format export
    toPrometheus() {
        let output = '';

        // Per-camera metrics
        for (const [cameraId, m] of this.metrics) {
            const labels = `camera_id="${cameraId}"`;

            output += `# HELP camera_fps_real Real-time FPS\n`;
            output += `# TYPE camera_fps_real gauge\n`;
            output += `camera_fps_real{${labels}} ${m.fps_real}\n`;

            output += `# HELP camera_rtp_jitter RTP jitter in ms\n`;
            output += `# TYPE camera_rtp_jitter gauge\n`;
            output += `camera_rtp_jitter{${labels}} ${m.rtp_jitter}\n`;

            output += `# HELP camera_packet_loss Packet loss percentage\n`;
            output += `# TYPE camera_packet_loss gauge\n`;
            output += `camera_packet_loss{${labels}} ${m.packet_loss}\n`;

            output += `# HELP camera_rtsp_reconnects RTSP reconnection count\n`;
            output += `# TYPE camera_rtsp_reconnects counter\n`;
            output += `camera_rtsp_reconnects{${labels}} ${m.rtsp_reconnects}\n`;

            output += `# HELP camera_frame_latency Frame latency in ms\n`;
            output += `# TYPE camera_frame_latency gauge\n`;
            output += `camera_frame_latency{${labels}} ${m.frame_latency}\n`;

            output += `# HELP camera_connected Connection status (1=connected, 0=disconnected)\n`;
            output += `# TYPE camera_connected gauge\n`;
            output += `camera_connected{${labels}} ${m.connected ? 1 : 0}\n`;
        }

        // Aggregate metrics
        output += `\n# Aggregate metrics\n`;
        output += `# HELP cameras_total Total number of cameras\n`;
        output += `# TYPE cameras_total gauge\n`;
        output += `cameras_total ${this.metrics.size}\n`;

        let connected = 0;
        for (const m of this.metrics.values()) {
            if (m.connected) connected++;
        }

        output += `# HELP cameras_connected Number of connected cameras\n`;
        output += `# TYPE cameras_connected gauge\n`;
        output += `cameras_connected ${connected}\n`;

        return output;
    }

    // Start Prometheus HTTP server
    startPrometheusServer() {
        const server = http.createServer((req, res) => {
            if (req.url === '/metrics') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(this.toPrometheus());
            } else if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'OK',
                    cameras: this.metrics.size,
                    timestamp: Date.now()
                }));
            } else {
                res.writeHead(404);
                res.end();
            }
        });

        server.listen(CAMERA_CONFIG.METRICS_PORT, () => {
            console.log(`[CameraMetrics] Prometheus metrics on port ${CAMERA_CONFIG.METRICS_PORT}`);
        });
    }

    // Get all metrics
    getAllMetrics() {
        const result = {};
        for (const [id, m] of this.metrics) {
            result[id] = m;
        }
        return result;
    }

    // Get single camera metrics
    getCameraMetrics(cameraId) {
        return this.metrics.get(cameraId) || null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

let instance = null;

async function initCameraMetrics() {
    if (!instance) {
        instance = new CameraMetricsCollector();
        await instance.init();
    }
    return instance;
}

function getCameraMetrics() {
    return instance;
}

module.exports = {
    CameraMetricsCollector,
    CAMERA_CONFIG,
    initCameraMetrics,
    getCameraMetrics
};
