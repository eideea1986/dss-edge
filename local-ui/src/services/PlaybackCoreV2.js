import Hls from 'hls.js';

export default class PlaybackCoreV2 {
    constructor(videoElement, camId, baseUrl = '/api') {
        this.video = videoElement;
        this.camId = camId;
        this.baseUrl = baseUrl;
        this.hls = null;
        this.currentFragPDT = 0;
        this.currentFragStartPTS = 0;
    }

    setSegments(segments) {
        // Sort segments chronologically
        this.segments = [...segments].sort((a, b) => a.startTs - b.startTs);

        // Build Virtual Timeline Map to handle gaps
        this.timeline = [];
        let virtualTime = 0;

        for (const s of this.segments) {
            const duration = s.endTs - s.startTs;
            this.timeline.push({
                realStart: s.startTs,
                realEnd: s.endTs,
                virtualStart: virtualTime,
                virtualEnd: virtualTime + duration,
                duration: duration
            });
            virtualTime += duration;
        }

        this.totalDurationMs = virtualTime;
        console.log(`[PlaybackCore] Timeline built: ${this.segments.length} segments, Total virtual duration: ${Math.round(virtualTime / 1000)}s`);
    }

    start(startEpochMs) {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }

        // AUTO-SKIP GAPS: If start time is in a gap, jump to next available segment
        const segment = this.segments?.find(s => startEpochMs >= s.startTs && startEpochMs <= s.endTs);
        let actualStart = startEpochMs;

        if (!segment && this.segments) {
            const next = this.segments.find(s => s.startTs > startEpochMs);
            if (next) {
                console.log(`[PlaybackCore] Seeking into gap. Jumping forward to ${new Date(next.startTs).toLocaleTimeString()}`);
                actualStart = next.startTs;
            }
        }

        const playlistUrl = `${this.baseUrl}/playback/playlist/${this.camId}.m3u8?start=${actualStart}&end=${actualStart + 60 * 60 * 1000}`;

        if (Hls.isSupported()) {
            this.hls = new Hls({
                enableWorker: true,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                backBufferLength: 10,
            });

            this.hls.loadSource(playlistUrl);
            this.hls.attachMedia(this.video);

            this.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                this.video.currentTime = data.levels[0].details.fragments[0].start;
                this.video.play().catch(e => console.warn("Autoplay blocked", e));
            });

            this.hls.on(Hls.Events.FRAG_CHANGED, (event, data) => {
                if (data.frag && data.frag.programDateTime) {
                    this.currentFragPDT = data.frag.programDateTime;
                    this.currentFragStartPTS = data.frag.start;
                }
            });

            // GAP MONITORING
            this.video.ontimeupdate = () => {
                const currentEpoch = this.getCurrentEpochMs();
                if (!currentEpoch) return;

                // If we hit a gap (no segment covers current playback time), find next
                const inSegment = this.segments?.some(s => currentEpoch >= s.startTs && currentEpoch <= s.endTs);
                if (!inSegment && this.segments) {
                    const next = this.segments.find(s => s.startTs > currentEpoch);
                    if (next) {
                        console.log("[PlaybackCore] Gap detected during playback. Skipping...");
                        this.seekTo(next.startTs);
                    }
                }
            };
        } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
            this.video.src = playlistUrl;
        }
    }

    epochToVideoTime(epochMs) {
        if (!this.timeline) return 0;
        for (const t of this.timeline) {
            if (epochMs >= t.realStart && epochMs <= t.realEnd) {
                return (t.virtualStart + (epochMs - t.realStart)) / 1000;
            }
        }
        return null; // Gap
    }

    seekTo(ts) {
        this.start(ts);
    }

    getCurrentEpochMs() {
        if (this.currentFragPDT && this.hls) {
            const timeInFrag = this.video.currentTime - this.currentFragStartPTS;
            const absoluteTime = this.currentFragPDT + (timeInFrag * 1000);
            return absoluteTime;
        }
        return 0;
    }

    destroy() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        this.video.ontimeupdate = null;
    }
}
