const { Transform } = require('stream');

/**
 * LeakyBucketStream
 * 
 * Provides a "Burst" of data at the start to fill the browser's video buffer,
 * then maintains a steady flow.
 */
class LeakyBucketStream extends Transform {
    constructor(options = {}) {
        super(options);
        // Default burst: 15MB (approx 1 minute of video)
        this.burstThreshold = options.burstThreshold || 15 * 1024 * 1024;
        this.bytesSent = 0;
        this.isBursting = true;
        this.startTime = Date.now();

        console.log(`[LeakyBucket] Initialized with ${this.burstThreshold / 1024 / 1024}MB burst threshold.`);
    }

    _transform(chunk, encoding, callback) {
        this.bytesSent += chunk.length;

        if (this.isBursting && this.bytesSent > this.burstThreshold) {
            this.isBursting = false;
            const elapsed = (Date.now() - this.startTime) / 1000;
            console.log(`[LeakyBucket] Burst complete: ${(this.bytesSent / 1024 / 1024).toFixed(2)} MB sent in ${elapsed.toFixed(2)}s. Switching to normal flow.`);
        }

        // We don't actually "throttle" yet (delay the callback), 
        // because we want FFmpeg to work as fast as the OS allows.
        // Standard piping handles the "leaky" part (back-pressure from the network).

        // This stream primarily serves as a monitor and ensures we don't accidentally
        // block the initial burst if we ever add throttling.

        this.push(chunk);
        callback();
    }
}

module.exports = LeakyBucketStream;
