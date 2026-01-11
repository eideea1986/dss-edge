#include "Process.hpp"
#include "Heartbeat.hpp"
#include "Logger.hpp"
#include <thread>
#include <chrono>
#include <sys/stat.h>
#include <csignal>
#include <atomic>

std::atomic<bool> running(true);

void signalHandler(int sig) {
    running = false;
}

// Check heartbeat file modification time
bool checkHeartbeatFile(const std::string& path, int maxAgeSeconds) {
    struct stat st;
    if (stat(path.c_str(), &st) != 0) return false;
    
    time_t now = time(nullptr);
    return (now - st.st_mtime) <= maxAgeSeconds;
}

int main() {
    signal(SIGTERM, signalHandler);
    signal(SIGINT, signalHandler);
    
    Logger log("/var/log/dss-supervisor.log");
    log.log("=== DSS Supervisor Started ===");
    
    // Recorder service manager (Node.js orchestrator)
    Process orchestrator{
        .name = "orchestrator",
        .cmd = "cd /opt/dss-edge && /usr/bin/node orchestrator/edgeOrchestrator.js"
    };
    
    Heartbeat orchestratorHB;
    int restartCount = 0;
    time_t lastRestartTime = 0;
    
    log.log("Starting orchestrator...");
    if (orchestrator.start()) {
        log.log("Orchestrator started with PID: " + std::to_string(orchestrator.pid));
        orchestratorHB.beat();
    } else {
        log.log("FATAL: Failed to start orchestrator");
        return 1;
    }
    
    while (running) {
        int status;
        
        /* -------- CRASH DETECT -------- */
        if (!orchestrator.isAlive()) {
            log.log("⚠ Orchestrator crashed (exit code: " + std::to_string(status) + ")");
            
            restartCount++;
            time_t now = time(nullptr);
            
            // Anti-flapping: If restarted >3 times in 60 seconds, wait longer
            if (restartCount > 3 && (now - lastRestartTime) < 60) {
                log.log("🔴 Restart loop detected (" + std::to_string(restartCount) + " restarts). Waiting 30s...");
                std::this_thread::sleep_for(std::chrono::seconds(30));
                restartCount = 0;
            }
            
            lastRestartTime = now;
            
            log.log("Restarting orchestrator...");
            if (orchestrator.start()) {
                log.log("✓ Orchestrator restarted with PID: " + std::to_string(orchestrator.pid));
                orchestratorHB.beat();
            } else {
                log.log("✗ Failed to restart orchestrator");
            }
        }
        
        /* -------- FREEZE DETECT (via heartbeat file) -------- */
        // Recorder processes write to /tmp/dss-recorder-*.hb every frame
        // If no update in 30s = freeze
        if (!checkHeartbeatFile("/tmp/dss-recorder.hb", 30)) {
            log.log("⚠ Recorder heartbeat timeout. System may be frozen.");
            // Don't restart immediately - just log and monitor
            // Orchestrator will handle individual recorder restarts
        }
        
        // Reset restart counter if system is stable for 5 minutes
        if (restartCount > 0 && (time(nullptr) - lastRestartTime) > 300) {
            log.log("System stable. Resetting restart counter.");
            restartCount = 0;
        }
        
        std::this_thread::sleep_for(std::chrono::seconds(5));
    }
    
    log.log("=== Supervisor shutting down ===");
    orchestrator.stop();
    log.log("Orchestrator stopped. Exiting.");
    
    return 0;
}
