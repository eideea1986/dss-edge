/* startStream.js - Dual Stream Registration */
const axios = require('axios');
const GO2RTC_API = "http://127.0.0.1:1984/api/streams";

module.exports = async function startStream(camera) {
    if (!camera.streams || !camera.streams.main) return;

    try {
        // 1. HD Stream (Recording/HighRes)
        await axios.put(`${GO2RTC_API}?src=${encodeURIComponent(camera.streams.main)}&name=${camera.id}_hd`);

        // 2. SUB Stream (Live/AI/LowRes)
        await axios.put(`${GO2RTC_API}?src=${encodeURIComponent(camera.streams.sub)}&name=${camera.id}_sub`);

        // 3. Alias for Default
        await axios.put(`${GO2RTC_API}?src=${encodeURIComponent(camera.streams.sub)}&name=${camera.id}`);

        console.log(`[Stream] Registered ${camera.id} (Dual: _hd, _sub)`);
    } catch (e) {
        console.error(`[Stream] Failed ${camera.id}:`, e.message);
    }
};
