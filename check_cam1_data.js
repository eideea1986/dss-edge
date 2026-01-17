const CAM_ID = 'cam_192_168_120_141';
const DATE = '2026-01-16';
const BASE_URL = 'http://192.168.120.208:8080/api';

async function check() {
    console.log(`Checking data for ${CAM_ID} on ${DATE}...`);
    try {
        const url = `${BASE_URL}/playback/timeline-day/${CAM_ID}/${DATE}`;
        console.log("GET", url);
        const res = await fetch(url);
        if (!res.ok) {
            console.error("HTTP Error:", res.status, res.statusText);
            return;
        }
        const data = await res.json();
        console.log("Segments Count:", data.segments?.length || 0);
        if (data.segments && data.segments.length > 0) {
            console.log("First:", data.segments[0]);
            console.log("Last:", data.segments[data.segments.length - 1]);
        }
    } catch (e) {
        console.error("Fetch Error:", e.message);
    }
}

check();
