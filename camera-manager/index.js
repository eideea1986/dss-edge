module.exports = {
    addCamera: require('./addCamera'),
    validateRtsp: require('./validateRtsp'),
    startStream: require('./startStream'),
    cameraStore: require('../local-api/store/cameraStore'),
    lifecycle: require('./lifecycle'),
    healthMonitor: require('./healthMonitor')
};
