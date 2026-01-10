const { Transform } = require('stream');

class LeakyBucketStream extends Transform {
    constructor(targetBitrate) {
        super();
        this.targetBytesPerSecond = targetBitrate / 8;
        this.updateInterval = 20; // ms
        this.bytesPerInterval = this.targetBytesPerSecond * (this.updateInterval / 1000);

        this.internalBuffer = Buffer.alloc(0);
        this.timer = null;
        this.isFlowing = false;

        // Max buffer before we start dropping or speeding up significantly
        this.maxBufferParams = this.targetBytesPerSecond * 5; // 5 seconds
    }

    _transform(chunk, encoding, callback) {
        this.internalBuffer = Buffer.concat([this.internalBuffer, chunk]);

        if (!this.isFlowing && this.internalBuffer.length > this.bytesPerInterval * 10) {
            this.startFlow();
        }

        // Handle Backpressure from source (FFmpeg) - unlikely needed with ultrafast, but good practice
        if (this.internalBuffer.length > this.maxBufferParams) {
            // Too much data built up? Speed up output temporarily
            this.bytesPerInterval *= 1.05;
        }

        callback();
    }

    startFlow() {
        this.isFlowing = true;
        this.timer = setInterval(() => {
            this.tick();
        }, this.updateInterval);
    }

    tick() {
        if (this.internalBuffer.length === 0) return;

        // Dynamic adjustment used to keep buffer around 1-2 seconds
        // If buffer < 1s, exact rate. If buffer > 2s, 1.1x rate.
        let currentRate = this.bytesPerInterval;
        if (this.internalBuffer.length > this.targetBytesPerSecond * 2) {
            currentRate *= 1.2;
        } else if (this.internalBuffer.length > this.targetBytesPerSecond) {
            currentRate *= 1.1;
        }

        const chunkSize = Math.floor(currentRate);
        const toSend = Math.min(chunkSize, this.internalBuffer.length);

        const chunk = this.internalBuffer.slice(0, toSend);
        this.internalBuffer = this.internalBuffer.slice(toSend);

        this.push(chunk);
    }

    _flush(callback) {
        if (this.timer) clearInterval(this.timer);
        if (this.internalBuffer.length > 0) {
            this.push(this.internalBuffer);
        }
        callback();
    }

    destroy(err) {
        if (this.timer) clearInterval(this.timer);
        super.destroy(err);
    }
}

module.exports = { LeakyBucketStream };
