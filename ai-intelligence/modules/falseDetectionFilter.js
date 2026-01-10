/**
 * False Detection Filter Module
 * Implements TRASSIR-style filtering:
 * - Ignore areas with repeated false detections
 * - Stability requirement (N consecutive frames)
 * - Motion-only requirement
 */
class FalseDetectionFilter {
    constructor(config) {
        this.config = config.default.false_detection_filter;
        this.ignoredZones = new Map(); // camera_id -> Array<{bbox, count, ignore_until}>
        console.log('[FalseDetectionFilter] Initialized');
    }

    /**
     * Filter out false detections
     * @param {Array} trackedObjects 
     * @param {string} camera_id 
     * @returns {Array} Valid objects only
     */
    filterFalseDetections(trackedObjects, camera_id) {
        if (!this.config.enabled) {
            return trackedObjects;
        }

        const validObjects = [];

        for (const obj of trackedObjects) {
            // Skip if object is in ignored zone
            if (this.isInIgnoredZone(obj, camera_id)) {
                continue;
            }

            // Check stability requirement
            if (!this.isStable(obj)) {
                continue;
            }

            // Check motion requirement
            if (this.config.motion_only && !this.hasRealMotion(obj)) {
                // Mark as potential false detection
                this.markFalseDetection(obj, camera_id);
                continue;
            }

            validObjects.push(obj);
        }

        return validObjects;
    }

    /**
     * Check if object is in an ignored zone
     */
    isInIgnoredZone(obj, camera_id) {
        const zones = this.ignoredZones.get(camera_id) || [];
        const now = new Date();

        for (const zone of zones) {
            if (now < zone.ignore_until) {
                if (this.bboxIntersects(obj.last_bbox, zone.bbox)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if object meets stability requirement
     */
    isStable(obj) {
        return obj.consecutive_frames >= this.config.stability_frames;
    }

    /**
     * Check if object has real motion
     */
    hasRealMotion(obj) {
        if (obj.trajectory.length < 2) {
            return false;
        }

        return obj.total_displacement > this.config.min_displacement_pixels;
    }

    /**
     * Mark detection as false and increment zone counter
     */
    markFalseDetection(obj, camera_id) {
        if (!this.ignoredZones.has(camera_id)) {
            this.ignoredZones.set(camera_id, []);
        }

        const zones = this.ignoredZones.get(camera_id);
        let zone = zones.find(z => this.bboxIntersects(obj.last_bbox, z.bbox));

        if (zone) {
            zone.count++;

            // If count exceeds threshold, extend ignore period
            if (zone.count >= this.config.detection_count_before_ignore) {
                const ignoreDuration = this.config.ignore_duration_seconds * 1000;
                zone.ignore_until = new Date(Date.now() + ignoreDuration);
                console.log(`[Filter] Ignoring zone in ${camera_id} for ${this.config.ignore_duration_seconds}s`);
            }
        } else {
            // Create new zone
            zones.push({
                bbox: obj.last_bbox,
                count: 1,
                first_detection: new Date(),
                ignore_until: new Date(Date.now() + 60000) // 1 min default
            });
        }

        // Cleanup expired zones
        this.cleanupExpiredZones(camera_id);
    }

    /**
     * Check if two bboxes intersect
     */
    bboxIntersects(bbox1, bbox2) {
        const [x1, y1, w1, h1] = bbox1;
        const [x2, y2, w2, h2] = bbox2;

        return !(x1 + w1 < x2 || x2 + w2 < x1 || y1 + h1 < y2 || y2 + h2 < y1);
    }

    /**
     * Cleanup expired ignored zones
     */
    cleanupExpiredZones(camera_id) {
        const zones = this.ignoredZones.get(camera_id);
        if (!zones) return;

        const now = new Date();
        const validZones = zones.filter(z => z.ignore_until > now || z.count < this.config.detection_count_before_ignore);
        this.ignoredZones.set(camera_id, validZones);
    }

    /**
     * Get count of ignored zones
     */
    getIgnoredZonesCount() {
        let count = 0;
        const now = new Date();
        for (const zones of this.ignoredZones.values()) {
            count += zones.filter(z => z.ignore_until > now).length;
        }
        return count;
    }

    /**
     * Check if module is ready
     */
    isReady() {
        return true;
    }
}

module.exports = FalseDetectionFilter;
