/**
 * EXEC-27: COMPLETE UI PLAYBACK FIX
 * Injectează explicit playback video start în UI
 */

// =============================================================================
//OLUTION 1: Simple Video Tag Direct Assignment (Quickest Fix)
// =============================================================================

/**
 * Add this to the Playback page component (wherever video element is rendered)
 */
function initializePlayback() {
    const videoElement = document.querySelector('video');
    if (!videoElement) {
        console.error('[PLAYBACK FIX] Video element not found');
        return;
    }

    // Listen for timeline segment clicks
    window.addEventListener('segment-click', (event) => {
        const { cameraId, startTs, endTs } = event.detail;
        playVideo(videoElement, cameraId, startTs, endTs);
    });
}

function playVideo(video, cameraId, startTs, endTs) {
    console.log('[PLAYBACK FIX] Starting playback:', { cameraId, startTs, endTs });

    // Construct HLS playlist URL
    const playlistUrl = `/api/playback/playlist/${cameraId}.m3u8?start=${startTs}&end=${endTs}`;

    // Stop any current playback
    video.pause();
    video.removeAttribute('src');
    video.load();

    // Check if browser supports HLS natively
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        video.src = playlistUrl;
        video.load();
        video.play().then(() => {
            console.log('[PLAYBACK FIX] Video started successfully');
        }).catch(err => {
            console.error('[PLAYBACK FIX] Play failed:', err);
        });
    } else {
        // Check if hls.js is loaded
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            const hls = new Hls({
                debug: true,
                enableWorker: true
            });

            hls.loadSource(playlistUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('[PLAYBACK FIX] HLS manifest parsed, starting playback');
                video.play().catch(err => {
                    console.error('[PLAYBACK FIX] Play failed:', err);
                });
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('[PLAYBACK FIX] HLS error:', data);
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error('[PLAYBACK FIX] Fatal network error, trying to recover');
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error('[PLAYBACK FIX] Fatal media error, trying to recover');
                            hls.recoverMediaError();
                            break;
                        default:
                            console.error('[PLAYBACK FIX] Fatal error, cannot recover');
                            hls.destroy();
                            break;
                    }
                }
            });

            // Store reference for cleanup
            window.currentHls = hls;
        } else {
            console.error('[PLAYBACK FIX] HLS not supported and hls.js not loaded');
            alert('Your browser does not support HLS playback. Please use Safari or install hls.js.');
        }
    }
}

// =============================================================================
// SOLUTION 2: Monkey Patch Existing Timeline Click Handler
// =============================================================================

/**
 * If you can't modify the React component, inject this fix via browser console
 * or as a separate script tag
 */
(function () {
    console.log('[PLAYBACK FIX] Injecting playback fix...');

    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        // Find video element
        const video = document.querySelector('video');
        if (!video) {
            console.error('[PLAYBACK FIX] No video element found. Retrying in 1s...');
            setTimeout(init, 1000);
            return;
        }

        console.log('[PLAYBACK FIX] Video element found:', video);

        // Hijack timeline segment clicks
        document.addEventListener('click', function (e) {
            // Find clicked timeline segment
            const segment = e.target.closest('.segment, .timeline-segment, [data-segment]');
            if (!segment) return;

            e.preventDefault();
            e.stopPropagation();

            console.log('[PLAYBACK FIX] Timeline segment clicked:', segment);

            // Extract camera ID and timestamps
            // Adjust these selectors based on your actual HTML structure
            const cameraId = getCameraId();
            const startTs = parseInt(segment.dataset.start || segment.getAttribute('data-start-ts'));
            const endTs = parseInt(segment.dataset.end || segment.getAttribute('data-end-ts'));

            if (cameraId && startTs && endTs) {
                playVideo(video, cameraId, startTs, endTs);
            } else {
                console.error('[PLAYBACK FIX] Missing data:', { cameraId, startTs, endTs });
            }
        }, true);

        console.log('[PLAYBACK FIX] Click hijack installed');
    }

    function getCameraId() {
        // Try multiple methods to get camera ID
        const urlParams = new URLSearchParams(window.location.search);
        const camIdFromUrl = urlParams.get('camera') || urlParams.get('camId');

        if (camIdFromUrl) return camIdFromUrl;

        // Try from page data attributes
        const playbackContainer = document.querySelector('[data-camera-id]');
        if (playbackContainer) {
            return playbackContainer.dataset.cameraId;
        }

        // Try from global state
        if (window.currentCamera) {
            return window.currentCamera;
        }

        console.error('[PLAYBACK FIX] Cannot determine camera ID');
        return null;
    }

    function playVideo(video, cameraId, startTs, endTs) {
        console.log('[PLAYBACK FIX] Playing:', { cameraId, startTs, endTs });

        const playlistUrl = `/api/playback/playlist/${cameraId}.m3u8?start=${startTs}&end=${endTs}`;

        // Stop current
        if (window.currentHls) {
            window.currentHls.destroy();
            window.currentHls = null;
        }

        video.pause();
        video.src = '';
        video.load();

        // Check native HLS support
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = playlistUrl;
            video.load();
            video.play();
        } else if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            const hls = new Hls({ debug: true });
            hls.loadSource(playlistUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
            window.currentHls = hls;
        } else {
            alert('HLS not supported');
        }
    }
})();

// =============================================================================
// SOLUTION 3: Add hls.js Library (if not already loaded)
// =============================================================================

/**
 * Add this script tag to index.html BEFORE your app scripts:
 * <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
 */

// =============================================================================
// TESTING COMMANDS (Run in Browser Console)
// =============================================================================

/**
 * Test 1: Check if video element exists
 */
// console.log(document.querySelector('video'));

/**
 * Test 2: Manually trigger playback (replace with actual camera ID and timestamps)
 */
/*
const video = document.querySelector('video');
const cameraId = 'cam_e4a9af3b';
const startTs = 1768734000000; // 2026-01-18 05:00:00 UTC
const endTs = 1768737600000;   // 2026-01-18 06:00:00 UTC
const playlistUrl = `/api/playback/playlist/${cameraId}.m3u8?start=${startTs}&end=${endTs}`;

if (typeof Hls !== 'undefined') {
    const hls = new Hls({ debug: true });
    hls.loadSource(playlistUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
} else {
    video.src = playlistUrl;
    video.play();
}
*/

// =============================================================================
// DEPLOYMENT INSTRUCTIONS
// =============================================================================

/**
 * QUICK FIX (No code changes needed):
 * 
 * 1. Open browser DevTools (F12)
 * 2. Go to Console tab
 * 3. Copy and paste SOLUTION 2 code above
 * 4. Press Enter
 * 5. Click on a timeline segment
 * 6. Video should start playing
 * 
 * PERMANENT FIX:
 * 
 * 1. Add hls.js to index.html:
 *    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
 * 
 * 2. In Playback component, add click handler:
 *    function onSegmentClick(segment) {
 *        const video = videoRef.current;
 *        const playlistUrl = `/api/playback/playlist/${cameraId}.m3u8?start=${segment.start_ts}&end=${segment.end_ts}`;
 *        
 *        if (Hls.isSupported()) {
 *            const hls = new Hls();
 *            hls.loadSource(playlistUrl);
 *            hls.attachMedia(video);
 *            hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
 *        } else {
 *            video.src = playlistUrl;
 *            video.play();
 *        }
 *    }
 */

export { initializePlayback, playVideo };
