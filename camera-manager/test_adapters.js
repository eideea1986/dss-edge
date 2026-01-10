const DeviceFactory = require('./adapters/DeviceFactory'); // Adjust path if needed
const cameras = require('../config/cameras.json'); // Adjust path if needed

async function testAdapters() {
    console.log('--- Testing Device Adapters ---');

    for (const cam of cameras) {
        if (!cam.enabled) continue;

        console.log(`Testing Camera: ${cam.id} (${cam.manufacturer} - ${cam.ip})`);

        try {
            const adapter = DeviceFactory.createAdapter(cam);
            const connected = await adapter.connect();

            if (connected) {
                console.log(`[SUCCESS] Connected to ${cam.ip}`);
                // Try to get stream URI
                const uri = await adapter.getStreamUri(cam.rtspHd.includes('101') ? '101' : '102');
                console.log(`          Stream URI: ${uri}`);
            } else {
                console.log(`[FAILED] Could not connect to ${cam.ip}`);
            }
        } catch (error) {
            console.error(`[ERROR] Exception for ${cam.ip}:`, error.message);
        }
        console.log('-----------------------------------');
    }
}

testAdapters();
