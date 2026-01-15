/**
 * DSS Live Core - EMERGENCY STABLE MODE (V13)
 * Strategy: Direct Go2RTC Pull (No FFmpeg Middleware)
 * Reason: Fixes CPU spike caused by FFmpeg restart loops.
 *         Go2RTC handles RTSP auth and transport negotiation natively.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const Redis = require("ioredis");

const CONFIG_FILE = "/opt/dss-edge/config/cameras.json";
const GO2RTC_BIN = "/opt/dss-edge/go2rtc";
const GO2RTC_CONF = "/opt/dss-edge/config/go2rtc.yaml";
const HEARTBEAT_KEY = "hb:live";

const redis = new Redis();
let go2rtcProc = null;

function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    } catch (e) {
        console.error("Config load error:", e);
        return [];
    }
}

function generateConfig(cameras) {
    let yaml = "streams:\n";

    cameras.forEach(cam => {
        // HD STREAM - Direct mapping
        if (cam.streams?.main) {
            let hdUrl = cam.streams.main;
            // Go2RTC specific syntax for TCP forcing
            if (!hdUrl.includes('#')) hdUrl += "#transport=tcp";
            yaml += `  ${cam.id}_hd: ${hdUrl}\n`;
        }

        // SUB STREAM - Direct mapping (Bypassing FFmpeg ingest for stability)
        if (cam.streams?.sub) {
            let subUrl = cam.streams.sub;
            if (!subUrl.includes('#')) subUrl += "#transport=tcp";
            yaml += `  ${cam.id}_sub: ${subUrl}\n`;
        }
    });

    yaml += `
api:
  listen: ":1984"
  origin: "*"
rtsp:
  listen: ":8554"
webrtc:
  listen: ":8555"
  candidates:
    - 192.168.120.208
    - 127.0.0.1
`;

    try {
        fs.writeFileSync(GO2RTC_CONF, yaml);
        console.log("[LIVE-CORE] Go2RTC config generated successfully.");
    } catch (e) {
        console.error("[LIVE-CORE] Failed to write config:", e);
    }
}

function startGo2RTC() {
    if (go2rtcProc) go2rtcProc.kill();

    console.log("[LIVE-CORE] Starting Go2RTC Service...");
    // Inherit stdio to see Go2RTC logs in journal
    go2rtcProc = spawn(GO2RTC_BIN, ["-config", GO2RTC_CONF], { stdio: "inherit" });

    go2rtcProc.on("exit", (code) => {
        console.warn(`[LIVE-CORE] Go2RTC exited code ${code}. Restarting in 2s...`);
        setTimeout(startGo2RTC, 2000);
    });
}

function run() {
    console.log("[LIVE-CORE] Starting V13 Direct Pull Mode");
    const cameras = loadConfig();
    generateConfig(cameras);
    startGo2RTC();

    // Heartbeat for Supervisor
    setInterval(() => {
        redis.set(HEARTBEAT_KEY, Date.now()).catch(e => console.error("Redis Error:", e));
    }, 2000);
}

run();
