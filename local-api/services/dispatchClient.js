/* dispatchClient.js - Transport Layer with ACK & Retry (Trassir Standard) */
const axios = require('axios');
const EventEmitter = require('events');
const http = require('http');
const https = require('https');

const DISPATCH_VPN1 = "http://194.107.163.227:8091/api/events"; // VPN1 direct
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1s start

function getDispatchURL() {
    // NEW ARCHITECTURE: NVR does NOT send events to Dispatch directly anymore.
    // This channel is reserved for Heartbeat/Status only (handled elsewhere).
    console.log('[Dispatch] Events are now routed via HUB (VPN2). Send skipped on Edge.');
    return "http://127.0.0.1"; // Dummy local
}



class DispatchClient extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.isSending = false;
        this.dispatchURL = getDispatchURL(); // Dynamic URL

        // Loop fast to keep queue moving
        setInterval(() => this.processQueue(), 100);
    }

    send(event) {
        // Idempotence Check in Queue
        if (this.queue.find(j => j.event.eventId === event.eventId)) return;

        this.queue.push({
            event,
            attempt: 0,
            nextTry: 0
        });
        console.log(`[Dispatch] Queued ${event.eventId}. Queue Size: ${this.queue.length}`);
    }

    async processQueue() {
        if (this.isSending || this.queue.length === 0) return;

        const now = Date.now();
        // Determine Next Job
        const jobIndex = this.queue.findIndex(j => now >= j.nextTry);
        if (jobIndex === -1) return;

        const job = this.queue[jobIndex];
        this.isSending = true;

        try {
            // Attempt Delivery
            const agentOptions = { localAddress: '10.100.0.3' };
            const httpAgent = new http.Agent(agentOptions);
            const httpsAgent = new https.Agent(agentOptions);
            await axios.post(this.dispatchURL, job.event, {
                timeout: 3000,
                httpAgent,
                httpsAgent
            });

            // ACK SIGNAL
            console.log(`[Dispatch] Delivered ${job.event.eventId}`);
            this.emit('ack', { eventId: job.event.eventId });

            // Remove
            this.queue.splice(jobIndex, 1);

        } catch (e) {
            // RETRY LOGIC
            job.attempt++;

            if (job.attempt >= MAX_RETRIES) {
                console.error(`[Dispatch] DROP ${job.event.eventId} (Max Retries Exceeded)`);
                this.emit('fail', { eventId: job.event.eventId });
                this.queue.splice(jobIndex, 1);
            } else {
                // Exponential Backoff
                const delay = INITIAL_RETRY_DELAY * Math.pow(2, job.attempt - 1); // 1s, 2s, 4s, 8s, 16s
                job.nextTry = now + delay;
                console.warn(`[Dispatch] RETRY ${job.event.eventId} in ${delay}ms (${e.message})`);
            }
        } finally {
            this.isSending = false;
            // Optimistic processing of next item
            if (this.queue.length > 0) setImmediate(() => this.processQueue());
        }
    }
}

module.exports = new DispatchClient();
