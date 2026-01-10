const koffi = require('koffi');
try {
    const lib = koffi.load('/opt/dss-edge/dahua-sdk-temp/libs/lin64/libdhnetsdk.so');
    console.log('Successfully loaded Dahua SDK');
} catch (e) {
    console.error('Failed to load Dahua SDK:', e.message);
}
