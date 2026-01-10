export const manufacturers = [
    {
        name: "Hikvision",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/Streaming/Channels/101",
        rtspTemplateSub: "rtsp://${user}:${pass}@${ip}:554/Streaming/Channels/102",
        models: ["Autodetect", "DS-2CD Series", "DS-7600 Series NVR", "DS-7700 Series NVR", "DS-9600 Series NVR", "HIK-Connect Compatible"]
    },
    {
        name: "Dahua",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/cam/realmonitor?channel=1&subtype=0",
        rtspTemplateSub: "rtsp://${user}:${pass}@${ip}:554/cam/realmonitor?channel=1&subtype=1",
        models: ["Autodetect", "IPC-HFW Series", "IPC-HDW Series", "IPC-HDBW Series", "NVR Series", "XVR Series"]
    },
    {
        name: "Axis",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/axis-media/media.amp",
        rtspTemplateSub: "rtsp://${user}:${pass}@${ip}:554/axis-media/media.amp?resolution=320x240",
        models: ["Autodetect", "M-Series", "P-Series", "Q-Series", "F-Series", "Companion"]
    },
    {
        name: "Reolink",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/h264Preview_01_main",
        rtspTemplateSub: "rtsp://${user}:${pass}@${ip}:554/h264Preview_01_sub",
        models: ["Autodetect", "RLC-410", "RLC-510A", "RLC-810A", "RLC-823A", "E1 Zoom", "RLN8-410 NVR", "RLN16-410 NVR"]
    },
    {
        name: "TP-Link Tapo/Kasa",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/stream1",
        rtspTemplateSub: "rtsp://${user}:${pass}@${ip}:554/stream2",
        models: ["Autodetect", "C100", "C200", "C310", "TC60", "TC70", "KC100", "KC105", "KC110"]
    },
    {
        name: "Amcrest",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/cam/realmonitor?channel=1&subtype=0",
        rtspTemplateSub: "rtsp://${user}:${pass}@${ip}:554/cam/realmonitor?channel=1&subtype=1",
        models: ["Autodetect", "ProHD", "UltraHD", "IP2M", "IP3M", "IP4M", "IP5M", "IP8M"]
    },
    {
        name: "Foscam",
        defaultPort: 88,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:88/videoMain",
        rtspTemplateSub: "rtsp://${user}:${pass}@${ip}:88/videoSub",
        models: ["Autodetect", "FI9800P", "FI9900P", "R2", "R4", "G4", "C1", "C2"]
    },
    {
        name: "Uniview (UNV)",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/media/video1",
        rtspTemplateSub: "rtsp://${user}:${pass}@${ip}:554/media/video2",
        models: ["Autodetect", "IPC Series", "NVR Series"]
    },
    {
        name: "Vivotek",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/live.sdp",
        models: ["Autodetect", "IB Series", "FD Series", "SD Series"]
    },
    {
        name: "Hanwha Techwin (Samsung)",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/profile1/media.smp",
        rtspTemplateSub: "rtsp://${user}:${pass}@${ip}:554/profile2/media.smp",
        models: ["Autodetect", "Wisenet Q", "Wisenet X", "Wisenet P", "Wisenet T"]
    },
    {
        name: "Avigilon",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/",
        models: ["Autodetect", "H4", "H5", "H6"]
    },
    {
        name: "Bosch",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/",
        models: ["Autodetect", "DINION", "FLEXIDOME", "AUTODOME"]
    },
    {
        name: "Honeywell",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/cam/realmonitor?channel=1&subtype=0",
        models: ["Autodetect", "H4", "H5", "Performance Series"]
    },
    {
        name: "Zosi",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/video1",
        models: ["Autodetect", "IPC", "NVR"]
    },
    {
        name: "Annke",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/H264/ch1/main/av_stream",
        rtspTemplateSub: "rtsp://${user}:${pass}@${ip}:554/H264/ch1/sub/av_stream",
        models: ["Autodetect", "C500", "C800", "CZ400", "NVR"]
    },
    {
        name: "Swann",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/ch01/0",
        models: ["Autodetect", "NVR-8580", "NVR-8680", "NVR-8780", "SW-NVR"]
    },
    {
        name: "Lorex",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/cam/realmonitor?channel=1&subtype=0",
        models: ["Autodetect", "LNB", "LNE", "LNZ", "NVR"]
    },
    {
        name: "Ubiquiti Unifi",
        defaultPort: 554,
        rtspTemplate: "rtsp://${ip}:554/s0",
        rtspTemplateSub: "rtsp://${ip}:554/s1",
        models: ["Autodetect", "G3", "G4", "G5", "Protect NVR (Requires enabling RTSP in console)"]
    },
    {
        name: "Wyze (Bridge)",
        defaultPort: 8554,
        rtspTemplate: "rtsp://${ip}:8554/wyze-bridge/${user}",
        models: ["Autodetect", "Wyze Cam v2", "Wyze Cam v3", "Wyze Pan"]
    },
    {
        name: "Eufy (Storage)",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/live0",
        models: ["Autodetect", "Indoor Cam", "EufyCam 2/2C (NAS RTSP)"]
    },
    {
        name: "Trassir",
        defaultPort: 8080,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/",
        models: ["Autodetect", "Any Trassir Server", "Trassir Cam"]
    },
    {
        name: "Mobotix",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/stream",
        models: ["Autodetect", "Mx6", "Mx7", "Move"]
    },
    {
        name: "Geovision",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/vis0",
        models: ["Autodetect", "GV-IP"]
    },
    {
        name: "Grandstream",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/0",
        models: ["Autodetect", "Gxv3610", "Gxv3615"]
    },
    {
        name: "D-Link",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/live1.sdp",
        models: ["Autodetect", "DCS-4602", "DCS-4701", "DCS-4622"]
    },
    {
        name: "Generic / ONVIF",
        defaultPort: 554,
        rtspTemplate: "rtsp://${user}:${pass}@${ip}:554/stream1",
        models: ["ONVIF Profile S/T/G", "Standard RTSP", "MJPEG Stream"]
    }
];

export const getLogo = (name) => {
    // Helper to get logo or emoji
    const map = {
        "Hikvision": "🔴 Hikvision",
        "Dahua": "🔵 Dahua",
        "Axis": "🟡 Axis",
        "Reolink": "🔷 Reolink",
        "TP-Link Tapo/Kasa": "🟢 Tapo",
        "Amcrest": "🛡️ Amcrest",
        "Foscam": "👁️ Foscam",
        "Uniview (UNV)": "🟣 UNV",
        "Ubiquiti Unifi": "⚪ Unifi",
        "Trassir": "🛡️ Trassir"
    };
    return map[name] || `📷 ${name}`;
};
