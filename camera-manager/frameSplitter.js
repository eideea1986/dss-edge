function splitFrame(cameraId, frameBuffer, aiCallback, recorderCallback) {
    // Distribute the frame to AI analysis and Recorder modules
    if (typeof aiCallback === 'function') {
        aiCallback(cameraId, frameBuffer);
    }
    if (typeof recorderCallback === 'function') {
        recorderCallback(cameraId, frameBuffer);
    }
}

module.exports = { splitFrame };
