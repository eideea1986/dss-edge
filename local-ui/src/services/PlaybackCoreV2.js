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

    setSegments(segments) { }

    start(startEpochMs) {
        // console.log(`[HLS] START Request: ${new Date(startEpochMs).toLocaleTimeString()}`);

        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }

        const startTime = startEpochMs;
        const endTime = startTime + (12 * 60 * 60 * 1000);

        const playlistUrl = `${this.baseUrl}/playback/playlist/${this.camId}.m3u8?start=${startTime}&end=${endTime}`;

        if (Hls.isSupported()) {
            this.hls = new Hls({
                debug: false, // Production Mode
                enableWorker: true,
                manifestLoadingTimeOut: 10000,
                fragLoadingTimeOut: 20000,
                startFragPrefetch: true,
                // Tweak buffer for smoother playback of small segments
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
            });

            this.hls.loadSource(playlistUrl);
            this.hls.attachMedia(this.video);

            this.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                this.video.play().catch(e => console.warn("Autoplay blocked", e));
            });

            this.hls.on(Hls.Events.FRAG_CHANGED, (event, data) => {
                if (data.frag && data.frag.programDateTime) {
                    this.currentFragPDT = data.frag.programDateTime;
                    this.currentFragStartPTS = data.frag.start;
                }
            });

            this.hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error(`[HLS] FATAL ERROR: ${data.type}`);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            this.hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            this.hls.recoverMediaError();
                            break;
                        default:
                            this.hls.destroy();
                            break;
                    }
                }
            });

        } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
            this.video.src = playlistUrl;
            this.video.addEventListener('loadedmetadata', () => {
                this.video.play();
            });
        }
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
        if (this.video.getStartDate && typeof this.video.getStartDate === 'function') {
            const sd = this.video.getStartDate();
            if (sd && !isNaN(sd.getTime())) {
                return sd.getTime() + (this.video.currentTime * 1000);
            }
        }
        return 0;
    }

    destroy() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        if (this.video) {
            this.video.pause();
            this.video.removeAttribute('src');
            this.video.load();
        }
    }
}
