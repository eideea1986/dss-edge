// Force cameraStore to reload from disk
const cameraStore = require('./local-api/store/cameraStore');
cameraStore.reload();
console.log("[Reload] Status refreshed from disk.");
