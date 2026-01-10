const { Transform } = require('stream');

class ThrottledStream extends Transform {
    constructor(options) {
        super(options);
        this.bitrate = options.bitrate || 2000000; // bps
        this.bytesPerSecond = this.bitrate / 8;
        this.chunkSize = Math.ceil(this.bytesPerSecond / 20); // Send every 50ms (20 times/sec)

        this.buffer = Buffer.alloc(0);
        this.isProcessing = false;

        this.interval = setInterval(() => this._pushChunk(), 50);
    }

    _transform(chunk, encoding, callback) {
        // Append incoming data to buffer
        this.buffer = Buffer.concat([this.buffer, chunk]);

        // Resume upstream only if buffer isn't too huge (backpressure)
        if (this.buffer.length > this.bytesPerSecond * 2) {
            // Wait for buffer to drain
            this.once('drain_internal', callback);
        } else {
            callback();
        }
    }

    _pushChunk() {
        if (this.buffer.length === 0) return;

        // Calculate amount to send
        const toSend = Math.min(this.chunkSize, this.buffer.length);
        const chunk = this.buffer.slice(0, toSend);
        this.buffer = this.buffer.slice(toSend);

        this.push(chunk);

        if (this.buffer.length < this.bytesPerSecond) {
            this.emit('drain_internal');
        }
    }

    _flush(callback) {
        clearInterval(this.interval);
        // Push remaining buffer
        if (this.buffer.length > 0) {
            this.push(this.buffer);
        }
        callback();
    }

    destroy(err) {
        clearInterval(this.interval);
        super.destroy(err);
    }
}

module.exports = { ThrottledStream };
