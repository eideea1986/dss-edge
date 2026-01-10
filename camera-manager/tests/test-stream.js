const { initCameraManager } = require("../cameraManager");

console.log("=== Starting Camera Manager Test ===");

// Mock global handlers for AI and Recorder
global.sendToAI = (id, frame) => {
    // Just print the frame size to verify data flow
    console.log(`[AI] Received frame from ${id}, size=${frame.length} bytes`);
};

global.sendToRecorder = (id, frame) => {
    console.log(`[REC] Received frame from ${id}, size=${frame.length} bytes`);
};

// Start the manager
initCameraManager();

// Keep alive for testing
setTimeout(() => {
    console.log("=== Test finished (10s run) ===");
    process.exit(0);
}, 10000);
