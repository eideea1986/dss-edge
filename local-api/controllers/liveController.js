const liveStore = require('../store/liveStore');
const axios = require('axios');

/** Start a live session (creates DB entry) */
async function startLive(req, res) {
    const { cameraId } = req.params;
    const type = req.query.type || 'GRID';
    try {
        const session = await liveStore.create({ cameraId, type });
        res.json(session);
    } catch (e) {
        console.error('Live start error', e);
        res.status(500).json({ error: 'Failed to start live' });
    }
}

/** Stop a live session (removes DB entry) */
async function stopLive(req, res) {
    const { cameraId } = req.params;
    try {
        const sessions = await liveStore.list();
        const session = sessions.find(s => s.cameraId === cameraId);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        await liveStore.remove(session.id);
        res.sendStatus(204);
    } catch (e) {
        console.error('Live stop error', e);
        res.status(500).json({ error: 'Failed to stop live' });
    }
}

/** Get SDP metadata for a camera (Enterprise requirement) */
async function getSDP(req, res) {
    const { camera } = req.query;
    // In a real scenario, this might return some capability info.
    // For now, it satisfies the UI's fetch request.
    res.json({ camera, sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1..." });
}

/** Handle WebRTC Offer and proxy to go2rtc */
async function handleOffer(req, res) {
    const { sdp, cameraId } = req.body;
    try {
        // Proxy to go2rtc: POST /api/webrtc?src=<id>
        // Go2RTC expects the SDP as the body (or encoded)
        const go2rtcUrl = `http://127.0.0.1:1984/api/webrtc?src=${cameraId}`;

        // Simple forward
        const response = await axios.post(go2rtcUrl, sdp, {
            headers: { 'Content-Type': 'text/plain' }
        });

        res.json({ answer: response.data });
    } catch (e) {
        console.error('[LiveController] Go2RTC Offer Fail:', e.message);
        res.status(502).json({ error: 'Go2RTC negotiation failed' });
    }
}

module.exports = { startLive, stopLive, getSDP, handleOffer };
