const { v4: uuidv4 } = require('uuid');

/**
 * Object Tracker Module
 * Tracks objects across frames, assigns unique IDs, maintains lifecycle
 */
class ObjectTracker {
    constructor(config) {
        this.config = config.default.object_tracker;
        this.activeTracks = new Map(); // camera_id -> Map<track_id, TrackedObject>
        console.log('[ObjectTracker] Initialized');
    }

    /**
     * Update tracks with new detections
     * @param {string} camera_id 
     * @param {Array} detections - [{class, confidence, bbox: [x, y, w, h]}]
     * @param {string} timestamp 
     * @param {number} frame_id 
     * @returns {Array} Updated tracked objects
     */
    updateTracks(camera_id, detections, timestamp, frame_id) {
        if (!this.activeTracks.has(camera_id)) {
            this.activeTracks.set(camera_id, new Map());
        }

        const tracks = this.activeTracks.get(camera_id);
        const matched = new Set();
        const updatedTracks = [];

        // Match detections to existing tracks
        for (const detection of detections) {
            if (detection.confidence < this.config.min_confidence) {
                continue; // Skip low confidence
            }

            const matchedTrack = this.findBestMatch(detection, tracks);

            if (matchedTrack) {
                // Update existing track
                this.updateTrack(matchedTrack, detection, timestamp, frame_id);
                matched.add(matchedTrack.id);
                updatedTracks.push(matchedTrack);
            } else {
                // Create new track
                const newTrack = this.createTrack(camera_id, detection, timestamp, frame_id);
                tracks.set(newTrack.id, newTrack);
                updatedTracks.push(newTrack);
            }
        }

        // Mark unmatched tracks as LOST
        for (const [trackId, track] of tracks) {
            if (!matched.has(trackId)) {
                track.lost_frames++;
                if (track.lost_frames > this.config.max_lost_frames) {
                    track.state = 'LOST';
                }
            }
        }

        // Cleanup old LOST tracks
        this.cleanupLostTracks(camera_id);

        return updatedTracks;
    }

    /**
     * Find best matching track for detection
     */
    findBestMatch(detection, tracks) {
        let bestMatch = null;
        let bestScore = 0;
        const detectionCenter = this.getCenter(detection.bbox);

        for (const track of tracks.values()) {
            if (track.state === 'LOST') continue;
            if (track.class_name !== detection.class) continue;

            const iou = this.calculateIoU(detection.bbox, track.last_bbox);
            const distance = this.euclideanDistance(detectionCenter, track.last_center);

            if (iou > this.config.iou_threshold || distance < this.config.max_distance_pixels) {
                const score = iou * 0.7 + (1 - distance / this.config.max_distance_pixels) * 0.3;
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = track;
                }
            }
        }

        return bestMatch;
    }

    /**
     * Create new tracked object
     */
    createTrack(camera_id, detection, timestamp, frame_id) {
        const center = this.getCenter(detection.bbox);
        return {
            id: uuidv4(),
            camera_id,
            class_name: detection.class,
            state: 'CREATED',
            first_seen: new Date(timestamp),
            last_seen: new Date(timestamp),
            first_frame: frame_id,
            last_frame: frame_id,
            frame_count: 1,
            consecutive_frames: 1,
            lost_frames: 0,
            trajectory: [center],
            last_bbox: detection.bbox,
            last_center: center,
            total_displacement: 0,
            confidence: detection.confidence,
            event_sent: false
        };
    }

    /**
     * Update existing track
     */
    updateTrack(track, detection, timestamp, frame_id) {
        const center = this.getCenter(detection.bbox);
        const displacement = this.euclideanDistance(center, track.last_center);

        track.last_seen = new Date(timestamp);
        track.last_frame = frame_id;
        track.frame_count++;
        track.consecutive_frames++;
        track.lost_frames = 0;
        track.trajectory.push(center);
        track.last_bbox = detection.bbox;
        track.last_center = center;
        track.total_displacement += displacement;
        track.confidence = detection.confidence;

        // Update state
        if (track.state === 'CREATED' && track.consecutive_frames >= 3) {
            track.state = 'CONFIRMED';
        } else if (track.state !== 'CONFIRMED') {
            track.state = 'ACTIVE';
        }

        // Limit trajectory history
        if (track.trajectory.length > 50) {
            track.trajectory = track.trajectory.slice(-50);
        }
    }

    /**
     * Calculate Intersection over Union
     */
    calculateIoU(bbox1, bbox2) {
        const [x1, y1, w1, h1] = bbox1;
        const [x2, y2, w2, h2] = bbox2;

        const xA = Math.max(x1, x2);
        const yA = Math.max(y1, y2);
        const xB = Math.min(x1 + w1, x2 + w2);
        const yB = Math.min(y1 + h1, y2 + h2);

        const intersectArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const box1Area = w1 * h1;
        const box2Area = w2 * h2;
        const unionArea = box1Area + box2Area - intersectArea;

        return intersectArea / unionArea;
    }

    /**
     * Calculate Euclidean distance between two points
     */
    euclideanDistance(p1, p2) {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    }

    /**
     * Get center point from bbox
     */
    getCenter(bbox) {
        const [x, y, w, h] = bbox;
        return { x: x + w / 2, y: y + h / 2 };
    }

    /**
     * Cleanup old LOST tracks
     */
    cleanupLostTracks(camera_id) {
        const tracks = this.activeTracks.get(camera_id);
        if (!tracks) return;

        for (const [trackId, track] of tracks) {
            if (track.state === 'LOST' && track.lost_frames > 20) {
                tracks.delete(trackId);
            }
        }
    }

    /**
     * Get active track count
     */
    getActiveCount() {
        let count = 0;
        for (const tracks of this.activeTracks.values()) {
            for (const track of tracks.values()) {
                if (track.state !== 'LOST') count++;
            }
        }
        return count;
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
        this.activeTracks.clear();
    }
}

module.exports = ObjectTracker;
