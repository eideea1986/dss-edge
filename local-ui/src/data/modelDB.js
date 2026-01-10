export const modelDB = [
    // --- HIKVISION ---
    {
        manufacturer: "Hikvision",
        modelRegex: /^DS-2CD/i, // Matches DS-2CDxxxx...
        rtspMain: "rtsp://${user}:${pass}@${ip}:554/Streaming/Channels/101",
        rtspSub: "rtsp://${user}:${pass}@${ip}:554/Streaming/Channels/102",
        commands: {
            "reboot": { method: "PUT", path: "/System/reboot" },
            "ptz": { method: "POST", path: "/PTZ/ctrl/channels/1" },
            "image": { method: "GET", path: "/Streaming/channels/101/picture" }
        }
    },
    {
        manufacturer: "Hikvision",
        modelRegex: /^DS-7[67]/i, // NVRs
        rtspMain: "rtsp://${user}:${pass}@${ip}:554/Streaming/Channels/101", // Default to ch1
        rtspSub: "rtsp://${user}:${pass}@${ip}:554/Streaming/Channels/102",
        note: "For NVRs, change '101' to 'X01' where X is channel number."
    },

    // --- TRASSIR ---
    {
        manufacturer: "Trassir",
        modelRegex: /.*/,
        rtspMain: "rtsp://${user}:${pass}@${ip}:554/live/main",
        rtspSub: "rtsp://${user}:${pass}@${ip}:554/live/sub",
        note: "Trassir Server stream"
    },

    // --- HIKVISION ---
    {
        manufacturer: "Dahua",
        modelRegex: /^IPC-/i,
        rtspMain: "rtsp://${user}:${pass}@${ip}:554/cam/realmonitor?channel=1&subtype=0",
        rtspSub: "rtsp://${user}:${pass}@${ip}:554/cam/realmonitor?channel=1&subtype=1",
        commands: {
            "reboot": { method: "GET", path: "/cgi-bin/magicBox.cgi?action=reboot" },
            "ptz": { method: "POST", path: "/cgi-bin/ptz.cgi?action=start&..." }
        }
    },

    // --- REOLINK ---
    {
        manufacturer: "Reolink",
        modelRegex: /^RLC-823A/i, // Specific PTZ model
        rtspMain: "rtsp://${user}:${pass}@${ip}:554/h264Preview_01_main",
        rtspSub: "rtsp://${user}:${pass}@${ip}:554/h264Preview_01_sub",
        features: ["ptz", "audio", "spotlight"]
    },
    {
        manufacturer: "Reolink",
        modelRegex: /^RLC-/i, // Generic Reolink
        rtspMain: "rtsp://${user}:${pass}@${ip}:554/h264Preview_01_main",
        rtspSub: "rtsp://${user}:${pass}@${ip}:554/h264Preview_01_sub"
    },

    // --- AMCREST ---
    {
        manufacturer: "Amcrest",
        modelRegex: /.*/, // Catch-all for Amcrest (usually Dahua rebrands)
        rtspMain: "rtsp://${user}:${pass}@${ip}:554/cam/realmonitor?channel=1&subtype=0",
        rtspSub: "rtsp://${user}:${pass}@${ip}:554/cam/realmonitor?channel=1&subtype=1"
    }
];

export const findModelConfig = (manufacturer, modelName) => {
    // 1. Try to match specific Manufacturer + Model Regex
    const exact = modelDB.find(curr =>
        curr.manufacturer.toLowerCase() === manufacturer.toLowerCase() &&
        curr.modelRegex.test(modelName)
    );
    if (exact) return exact;

    // 2. Fallback: Match just Manufacturer with catch-all regex or first entry
    const generic = modelDB.find(curr =>
        curr.manufacturer.toLowerCase() === manufacturer.toLowerCase() &&
        (!curr.modelRegex || curr.modelRegex.source === ".*")
    );
    return generic || null;
};
