#include "Process.hpp"
#include "Heartbeat.hpp"
#include "Logger.hpp"
#include <thread>
#include <chrono>
#include <sys/stat.h>
#include <csignal>
#include <atomic>
#include <iostream>
#include <fstream>
#include <sstream>

std::atomic<bool> running(true);

void signalHandler(int sig) {
    running = false;
}

struct HeartbeatState {
    long ts = 0;
    int hdd = 0;
    int cpu = 0;
    int mem = 0;
    bool orch = false;
    bool valid = false;
};

HeartbeatState parseHeartbeat(const std::string& path) {
    HeartbeatState state;
    std::ifstream ifs(path);
    if (!ifs.is_open()) return state;
    
    std::string line;
    if (std::getline(ifs, line)) {
        try {
            auto getVal = [&](const std::string& key) -> std::string {
                size_t pos = line.find("\"" + key + "\":");
                if (pos == std::string::npos) return "";
                pos += key.length() + 3;
                size_t end = line.find_first_of(",}", pos);
                return line.substr(pos, end - pos);
            };

            std::string tsStr = getVal("ts");
            std::string hddStr = getVal("hdd");
            std::string cpuStr = getVal("cpu");
            std::string memStr = getVal("mem");
            std::string orchStr = getVal("orch");

            if (!tsStr.empty()) {
                state.ts = std::stol(tsStr);
                state.hdd = std::stoi(hddStr);
                state.cpu = std::stoi(cpuStr);
                state.mem = std::stoi(memStr);
                state.orch = (orchStr == "true");
                state.valid = true;
            }
        } catch (...) { state.valid = false; }
    }
    return state;
}

int main() {
    signal(SIGTERM, signalHandler);
    signal(SIGINT, signalHandler);
    
    Logger log("/var/log/dss-supervisor.log");
    log.log("=== DSS Supervisor Started ===");
    
    const std::string hbPath = "/tmp/dss-system.hb";
    const std::string recordPath = "/opt/dss-edge/storage";
    const int ACTION_LEVEL = 90;
    const int EMERGENCY_LEVEL = 95;
    
    // Heartbeat Daemon (Primary Truth Source)
    Process hbDaemon{
        .name = "heartbeat",
        .cmd = "export DSS_RECORD_PATH=" + recordPath + " && exec /usr/bin/dss-heartbeat"
    };

    // Recorder service manager (Node.js orchestrator)
    Process orchestrator{
        .name = "orchestrator",
        .cmd = "cd /opt/dss-edge && export DSS_RECORD_PATH=" + recordPath + " && exec /usr/bin/node orchestrator/edgeOrchestrator.js"
    };
    
    int restartCount = 0;
    time_t lastRestartTime = 0;
    time_t lastDiskAction = 0;
    time_t startTime = time(nullptr);
    
    log.log("Starting system services [Truth Anchor Active]...");
    hbDaemon.start();
    orchestrator.start();

    while (running) {
        time_t now = time(nullptr);
        
        if (!hbDaemon.isAlive()) {
            log.log("⚠ Heartbeat daemon died. Restarting...");
            hbDaemon.start();
        }

        if (!orchestrator.isAlive()) {
            log.log("⚠ Orchestrator process died. Restarting...");
            restartCount++;
            if (restartCount > 3 && (now - lastRestartTime) < 60) {
                log.log("🔴 Restart loop detected. Waiting 30s...");
                std::this_thread::sleep_for(std::chrono::seconds(30));
                restartCount = 0;
            }
            lastRestartTime = now;
            startTime = now;
            orchestrator.start();
        }
        
        HeartbeatState hb = parseHeartbeat(hbPath);
        bool hbStale = (hb.valid && (now - hb.ts) > 30); // ANTIGRAVITY: --supervisor-freeze-threshold 30s
        
        if (!hb.valid || hbStale) {
            log.log("🔴 ERROR: System heartbeat " + std::string(hbStale ? "STALE" : "INVALID") + ". System Degraded.");
        } else {
            // Truth Anchor Decisions
            
            // 1. Orchestrator Freeze Detect (Truth from PID verify)
            if (!hb.orch && (now - startTime) > 60) {
                log.log("⚠ Heartbeat reports Orchestrator freeze/PID mismatch. Restarting...");
                orchestrator.stop();
            }

            // 2. HDD Pressure Enforcement (every 30s)
            if (now - lastDiskAction >= 30) {
                system(("redis-cli set hb:disk_usage " + std::to_string(hb.hdd)).c_str());

                if (hb.hdd >= EMERGENCY_LEVEL) {
                    log.log("🚨 EMERGENCY: HDD usage at " + std::to_string(hb.hdd) + "%. Aggressive cleanup!");
                    system("redis-cli set state:retention:trigger aggressive");
                    system("redis-cli publish state:retention:trigger aggressive");
                } else if (hb.hdd >= ACTION_LEVEL) {
                    log.log("⚠ ACTION: HDD usage at " + std::to_string(hb.hdd) + "%. Normal retention.");
                    system("redis-cli set state:retention:trigger normal");
                    system("redis-cli publish state:retention:trigger normal");
                }
                lastDiskAction = now;
            }
            if (hb.cpu > 95) log.log("⚠ Heavy CPU load sensed: " + std::to_string(hb.cpu) + "%");
        }
        
        if (restartCount > 0 && (now - lastRestartTime) > 300) restartCount = 0;
        std::this_thread::sleep_for(std::chrono::seconds(5));
    }
    
    log.log("=== Supervisor shutting down ===");
    orchestrator.stop();
    hbDaemon.stop();
    return 0;
}
