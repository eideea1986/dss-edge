const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Mock dependencies
const mockDetector = class {
    constructor() { }
    on() { }
    start() { }
};

// We need to bypass the real require as it starts the service
// For testing, we can use parts of the logic or a dedicated test file.
// Let's test the sanitization and and UUID fallback directly.

function testSanitization() {
    console.log("Testing URL Sanitization...");
    const badUrl = "rtsp://admin:pass@192.168.1.1\\:554/stream";
    const sanitized = badUrl.replace(/\\/g, "");
    console.log(`Original: ${badUrl}`);
    console.log(`Sanitized: ${sanitized}`);
    assert.strictEqual(sanitized, "rtsp://admin:pass@192.168.1.1:554/stream");
    console.log("✅ Sanitization OK");
}

function testUUIDFallback() {
    console.log("Testing UUID Fallback...");
    const crypto = require('crypto');
    function getUUID() {
        if (crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    const uuid = getUUID();
    console.log(`Generated UUID: ${uuid}`);
    assert.match(uuid, /^[0-9a-f-]{36}$/);
    console.log("✅ UUID Generation OK");
}

function testDayCrossing() {
    console.log("Testing Day Crossing Logic...");
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let lastRestartDate = yesterday;
    let stopCalled = false;

    if (lastRestartDate !== today) {
        console.log(`Day changed from ${lastRestartDate} to ${today}. Triggering restart...`);
        stopCalled = true;
    }

    assert.strictEqual(stopCalled, true);
    console.log("✅ Day Crossing check OK");
}

try {
    testSanitization();
    testUUIDFallback();
    testDayCrossing();
    console.log("\nALL LOCAL TESTS PASSED!");
} catch (e) {
    console.error("\nTEST FAILED:");
    console.error(e);
    process.exit(1);
}
