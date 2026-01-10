const { v4: uuidv4 } = require('uuid');

/**
 * Event Manager Module - Anti-Spam Core
 * Implements:
 * - Event deduplication (1 event per object ID)
 * - Cooldown timers (no spam per camera/ROI)
 * - Event consolidation
 * - Priority management
 */
class EventManager {
    constructor(config) {
        this.config = config.default.event_manager;
        this.activeCooldowns = new Map(); // key -> cooldown_until
        this.processedObjects = new Set(); // object IDs that already generated events
        console.log('[EventManager] Initialized with', this.config.cooldown_seconds, 's cooldown');
    }

    /**
     * Process objects and generate events (with anti-spam)
     * @param {Array} validObjects - Objects that passed filtering
     * @param {string} camera_id 
     * @returns {Array} Generated events
     */
    async processObjects(validObjects, camera_id) {
        const events = [];

        for (const obj of validObjects) {
            // 1. Check if object already sent event
            if (obj.event_sent || this.processedObjects.has(obj.id)) {
                continue;
            }

            // 2. Check if object meets stability requirement for events
            if (obj.state !== 'CONFIRMED' && obj.state !== 'ACTIVE') {
                continue; // Only CREATED state doesn't generate events yet
            }

            // 3. Check cooldown for camera/ROI combination
            const cooldownKey = `${camera_id}:${obj.roi_id || 'default'}:${obj.class_name}`;
            if (this.isOnCooldown(cooldownKey)) {
                continue;
            }

            // 4. Generate event
            const event = this.createEvent(obj, camera_id);
            events.push(event);

            // 5. Set cooldown
            this.setCooldown(cooldownKey, this.config.cooldown_seconds);

            // 6. Mark object as processed
            this.processedObjects.add(obj.id);
            obj.event_sent = true;
        }

        // Cleanup old processed objects (keep last 1000)
        if (this.processedObjects.size > 1000) {
            const sorted = Array.from(this.processedObjects);
            this.processedObjects = new Set(sorted.slice(-1000));
        }

        return events;
    }

    /**
     * Create event from tracked object
     */
    createEvent(obj, camera_id) {
        return {
            id: uuidv4(),
            object_id: obj.id,
            camera_id,
            event_type: `${obj.class_name}_detected`,
            timestamp: obj.last_seen,
            confidence: obj.confidence,
            roi_id: obj.roi_id || null,
            priority: this.calculatePriority(obj),
            metadata: {
                trajectory_length: obj.trajectory.length,
                total_displacement: obj.total_displacement,
                frame_count: obj.frame_count,
                first_seen: obj.first_seen,
                bbox: obj.last_bbox
            },
            sent_to_dispatch: false
        };
    }

    /**
     * Calculate event priority
     * 1 = critical, 5 = normal, 10 = low
     */
    calculatePriority(obj) {
        // Persons are higher priority than vehicles
        if (obj.class_name === 'person') {
            return obj.total_displacement > 100 ? 2 : 3;
        }
        if (obj.class_name === 'car' || obj.class_name === 'truck') {
            return 4;
        }
        return 5; // default
    }

    /**
     * Check if key is on cooldown
     */
    isOnCooldown(key) {
        const cooldownUntil = this.activeCooldowns.get(key);
        if (!cooldownUntil) return false;

        const now = new Date();
        if (now < cooldownUntil) {
            return true;
        }

        // Expired, remove
        this.activeCooldowns.delete(key);
        return false;
    }

    /**
     * Set cooldown for key
     */
    setCooldown(key, seconds) {
        const cooldownUntil = new Date(Date.now() + seconds * 1000);
        this.activeCooldowns.set(key, cooldownUntil);
    }

    /**
     * Get events generated today (placeholder - would query DB)
     */
    async getEventsToday() {
        // TODO: Query database
        return this.processedObjects.size;
    }

    /**
     * Check if module is ready
     */
    isReady() {
        return true;
    }

    /**
     * Cleanup on shutdown
     */
    cleanup() {
        this.activeCooldowns.clear();
        this.processedObjects.clear();
    }
}

module.exports = EventManager;
