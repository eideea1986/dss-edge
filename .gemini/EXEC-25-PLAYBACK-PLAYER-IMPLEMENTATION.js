/**
 * EXEC-25: Playback Video Player Implementation Guide
 * 
 * CRITICAL SEPARATION: LIVE vs PLAYBACK pipelines must be completely independent
 * 
 * Backend Endpoints Available:
 * 1. /api/playback/playlist/:camId.m3u8?start=<UTC_ms>&end=<UTC_ms>  [HLS VOD]
 * 2. /api/playback/stream/:camId/:file?offset=<sec>&duration=<sec>   [Direct Segment]
 * 3. /api/playback/mjpeg/:camId?start=<UTC_ms>                        [MJPEG Stream]
 * 4. /api/playback/range/:camId                                       [Get first/last recording]
 * 5. /api/playback/timeline-day/:camId/:date                          [Get segments for day]
 */

// ═══════════════════════════════════════════════════════════════════════════
// APPROACH 1: HLS PLAYBACK (RECOMMENDED - Browser Native Support)
// ═══════════════════════════════════════════════════════════════════════════

class PlaybackPlayerHLS {
    constructor(videoElement) {
        this.video = videoElement;
        this.currentCamera = null;
        this.isPlaybackMode = false;
    }

    /**
     * CRITICAL: Switch from LIVE to PLAYBACK mode
     */
    enterPlaybackMode() {
        console.log('[PLAYBACK] Entering PLAYBACK mode');

        // 1. DETACH any LIVE player
        if (window.livePlayer) {
            window.livePlayer.stop();
            window.livePlayer = null;
        }

        // 2. Close any WebRTC connections
        if (window.webrtcPeerConnection) {
            window.webrtcPeerConnection.close();
            window.webrtcPeerConnection = null;
        }

        // 3. Reset video element
        this.video.pause();
        this.video.src = '';
        this.video.load();

        this.isPlaybackMode = true;
    }

    /**
     * EXEC-25 SET 2: EXPLICIT playback start on segment click
     * 
     * @param {string} cameraId - Camera ID
     * @param {number} startTs - UTC timestamp (milliseconds)
     * @param {number} endTs - UTC timestamp (milliseconds)
     */
    playSegment(cameraId, startTs, endTs) {
        if (!this.isPlaybackMode) {
            this.enterPlaybackMode();
        }

        // EXEC-25 SET 3: Construct playback URL with FULL context
        const playlistUrl = `/api/playback/playlist/${cameraId}.m3u8?start=${startTs}&end=${endTs}`;

        console.log('[PLAYBACK] Loading segment:', {
            camera: cameraId,
            start: new Date(startTs).toISOString(),
            end: new Date(endTs).toISOString(),
            url: playlistUrl
        });

        // EXEC-25 SET 2.1: Explicit attachment and play
        this.video.pause();
        this.video.src = playlistUrl;
        this.video.load();

        // Wait for loadeddata before playing
        this.video.addEventListener('loadeddata', () => {
            console.log('[PLAYBACK] Video loaded, starting playback');
            this.video.play().catch(err => {
                console.error('[PLAYBACK] Play failed:', err);
                this.handlePlaybackError('Failed to start playback');
            });
        }, { once: true });

        // Error handling
        this.video.addEventListener('error', (e) => {
            console.error('[PLAYBACK] Video error:', e);
            this.handlePlaybackError('Video playback error');
        }, { once: true });

        this.currentCamera = cameraId;
    }

    /**
     * EXEC-25 SET 5: UI State sync - only mark active after video starts
     */
    handlePlaybackError(message) {
        console.error('[PLAYBACK] ERROR:', message);
        // Dispatch event to UI
        window.dispatchEvent(new CustomEvent('playback-error', {
            detail: { message }
        }));
    }

    /**
     * Exit playback mode and return to LIVE
     */
    exitPlaybackMode() {
        console.log('[PLAYBACK] Exiting PLAYBACK mode');
        this.video.pause();
        this.video.src = '';
        this.video.load();
        this.isPlaybackMode = false;
        this.currentCamera = null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// APPROACH 2: DIRECT MP4 PLAYBACK (Simpler, but limited seek support)
// ═══════════════════════════════════════════════════════════════════════════

class PlaybackPlayerDirect {
    constructor(videoElement) {
        this.video = videoElement;
        this.currentSegment = null;
    }

    /**
     * Play a single segment directly
     */
    playSegment(cameraId, segmentFile, startTs, endTs) {
        // Construct direct segment URL
        const segmentUrl = `/api/playback/stream/${cameraId}/${segmentFile}`;

        console.log('[PLAYBACK-DIRECT] Playing:', segmentUrl);

        this.video.pause();
        this.video.src = segmentUrl;
        this.video.load();

        this.video.play().catch(err => {
            console.error('[PLAYBACK-DIRECT] Play failed:', err);
        });

        this.currentSegment = { cameraId, segmentFile, startTs, endTs };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// REACT COMPONENT EXAMPLE (Playback Page)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Example React component showing correct EXEC-25 implementation
 */
const PlaybackPage = () => {
    const videoRef = useRef(null);
    const playerRef = useRef(null);
    const [playbackState, setPlaybackState] = useState('IDLE');
    const [segments, setSegments] = useState([]);
    const [selectedCamera, setSelectedCamera] = useState(null);

    useEffect(() => {
        if (videoRef.current) {
            // Initialize playback player
            playerRef.current = new PlaybackPlayerHLS(videoRef.current);

            // Listen for playback errors
            window.addEventListener('playback-error', handlePlaybackError);

            return () => {
                window.removeEventListener('playback-error', handlePlaybackError);
                if (playerRef.current) {
                    playerRef.current.exitPlaybackMode();
                }
            };
        }
    }, []);

    /**
     * EXEC-25 SET 1: Smart default - load recent recordings on mount
     */
    useEffect(() => {
        if (selectedCamera) {
            loadRecentRecordings(selectedCamera);
        }
    }, [selectedCamera]);

    async function loadRecentRecordings(cameraId) {
        try {
            // GET recording range
            const range = await fetch(`/api/playback/range/${cameraId}`).then(r => r.json());

            if (!range.end) {
                setPlaybackState('NO_DATA');
                return;
            }

            // Get last day's recordings
            const lastTs = new Date(range.end);
            const dateStr = `${lastTs.getFullYear()}-${String(lastTs.getMonth() + 1).padStart(2, '0')}-${String(lastTs.getDate()).padStart(2, '0')}`;

            const timeline = await fetch(`/api/playback/timeline-day/${cameraId}/${dateStr}`).then(r => r.json());

            // EXEC-23 State handling
            if (timeline.playback_state !== 'OK') {
                setPlaybackState(timeline.playback_state);
                alert(timeline.state_reason);
                return;
            }

            setSegments(timeline.segments);
            setPlaybackState('READY');

            // Auto-play most recent segment
            if (timeline.segments.length > 0) {
                const lastSegment = timeline.segments[timeline.segments.length - 1];
                handleSegmentClick(lastSegment);
            }

        } catch (err) {
            console.error('[PLAYBACK] Load error:', err);
            setPlaybackState('ERROR');
        }
    }

    /**
     * EXEC-25 SET 2: EXPLICIT playback start on segment click
     */
    function handleSegmentClick(segment) {
        console.log('[UI] Segment clicked:', segment);

        if (!playerRef.current) {
            console.error('[UI] Player not initialized');
            return;
        }

        // CRITICAL: Explicit playback invocation
        playerRef.current.playSegment(
            selectedCamera,
            segment.start_ts,  // Already in UTC from EXEC-23
            segment.end_ts     // Already in UTC from EXEC-23
        );

        setPlaybackState('PLAYING');
    }

    function handlePlaybackError(event) {
        setPlaybackState('ERROR');
        alert(`Playback Error: ${event.detail.message}`);
    }

    return (
        <div>
            <video ref={videoRef} controls style={{ width: '100%', maxHeight: '600px' }} />

            {/* Playback State Display (EXEC-25 SET 5) */}
            <div className="playback-status">
                State: {playbackState}
            </div>

            {/* Timeline (EXEC-25 SET 4) */}
            <div className="timeline">
                {segments.map((seg, idx) => (
                    <div
                        key={idx}
                        className="segment"
                        onClick={() => handleSegmentClick(seg)}
                        style={{
                            left: `${calculatePosition(seg.start_ts)}px`,
                            width: `${calculateWidth(seg.start_ts, seg.end_ts)}px`
                        }}
                    >
                        {new Date(seg.start_ts).toLocaleTimeString()}
                    </div>
                ))}
            </div>

            {/* State Messages (EXEC-23 + EXEC-25) */}
            {playbackState === 'NO_DATA' && (
                <div className="alert">Nu există înregistrări pentru această cameră.</div>
            )}
            {playbackState === 'TIME_MISMATCH' && (
                <div className="alert warning">Intervalul selectat nu conține date. Selectați o altă dată.</div>
            )}
            {playbackState === 'INDEX_REBUILDING' && (
                <div className="alert info">Indexul este în reconstruire. Datele vor apărea automat.</div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICATION CHECKLIST
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TEST PROCEDURE:
 * 
 * 1. Open DevTools → Network tab
 * 2. Click a timeline segment
 * 3. VERIFY:
 *    ✅ Request appears: /api/playback/playlist/cam_xxx.m3u8?start=...&end=...
 *    ✅ Followed by: /api/playback/stream/cam_xxx/...?offset=...&duration=...
 *    ✅ Status: 200 OK
 *    ✅ Content-Type: video/mp2t or application/vnd.apple.mpegurl
 * 
 * 4. Console shows:
 *    ✅ [PLAYBACK] Entering PLAYBACK mode
 *    ✅ [PLAYBACK] Loading segment: {...}
 *    ✅ [PLAYBACK] Video loaded, starting playback
 * 
 * 5. Video element:
 *    ✅ video.paused === false
 *    ✅ video.currentTime advancing
 *    ✅ video.networkState === NETWORK_LOADING (2)
 * 
 * IF ANY OF THE ABOVE FAIL:
 * - Check console for errors
 * - Verify UTC timestamps in request
 * - Confirm backend returns 200 OK
 * - Check for CORS errors
 */

export { PlaybackPlayerHLS, PlaybackPlayerDirect, PlaybackPage };
