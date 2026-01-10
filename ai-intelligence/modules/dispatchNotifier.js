const axios = require('axios');

/**
 * Dispatch Notifier Module
 * Sends filtered events to Dispatch UI
 * Supports HTTP POST and WebSocket (future)
 */
class DispatchNotifier {
    constructor(config) {
        this.config = config.dispatch;
        this.endpoint = `${this.config.url}${this.config.api_endpoint}`;
        console.log('[DispatchNotifier] Initialized, endpoint:', this.endpoint);
    }

    /**
     * Send events to Dispatch
     * @param {Array} events 
     * @returns {Promise}
     */
    async sendToDispatch(events) {
        if (!events || events.length === 0) {
            return { sent: 0 };
        }

        try {
            // Send via HTTP POST
            const response = await axios.post(this.endpoint, {
                source: 'ai_intelligence',
                timestamp: new Date().toISOString(),
                count: events.length,
                events: events.map(e => ({
                    id: e.id,
                    object_id: e.object_id,
                    camera_id: e.camera_id,
                    type: e.event_type,
                    timestamp: e.timestamp,
                    confidence: e.confidence,
                    priority: e.priority,
                    metadata: e.metadata
                }))
            }, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Source': 'AI-Intelligence'
                }
            });

            console.log(`[Dispatch] Sent ${events.length} events, status: ${response.status}`);

            //Mark events as sent
            for (const event of events) {
                event.sent_to_dispatch = true;
            }

            return {
                sent: events.length,
                status: response.status
            };

        } catch (error) {
            // Log error but don't crash
            if (error.code === 'ECONNREFUSED') {
                console.error('[Dispatch] Connection refused - is Dispatch server running?');
            } else {
                console.error('[Dispatch] Send error:', error.message);
            }

            return {
                sent: 0,
                error: error.message
            };
        }
    }

    /**
     * Send single event (wrapper)
     */
    async sendEvent(event) {
        return this.sendToDispatch([event]);
    }

    /**
     * Check if module is ready
     */
    isReady() {
        return true;
    }
}

module.exports = DispatchNotifier;
