#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <thread>
#include <chrono>
#include <sys/statvfs.h>
#include <sys/sysinfo.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>
#include <sstream>
#include <algorithm>
#include <csignal>

struct SystemState {
    long timestamp;
    int hdd_percent;
    int cpu_percent;
    int mem_percent;
    bool orchestrator_alive;
    bool error;
};

// --- METRIC GATHERING ---

int getHDDUsage(const std::string& path) {
    if (path.empty()) return -1;
    struct statvfs vfs;
    if (statvfs(path.c_str(), &vfs) != 0) return -1;
    unsigned long total = vfs.f_blocks * vfs.f_frsize;
    unsigned long avail = vfs.f_bavail * vfs.f_frsize;
    if (total == 0) return 0;
    return (int)(((total - avail) * 100) / total);
}

int getMemoryUsage() {
    struct sysinfo si;
    if (sysinfo(&si) != 0) return -1;
    unsigned long total = si.totalram * si.mem_unit;
    unsigned long free = si.freeram * si.mem_unit;
    if (total == 0) return 0;
    return (int)(((total - free) * 100) / total);
}

struct CPUData {
    unsigned long long user, nice, system, idle, iowait, irq, softirq, steal;
};

CPUData readCPU() {
    CPUData d = {0};
    std::ifstream file("/proc/stat");
    std::string line;
    if (std::getline(file, line)) {
        std::stringstream ss(line);
        std::string cpu;
        ss >> cpu >> d.user >> d.nice >> d.system >> d.idle >> d.iowait >> d.irq >> d.softirq >> d.steal;
    }
    return d;
}

int calculateCPU(const CPUData& prev, const CPUData& curr) {
    unsigned long long prevIdle = prev.idle + prev.iowait;
    unsigned long long currIdle = curr.idle + curr.iowait;

    unsigned long long prevNonIdle = prev.user + prev.nice + prev.system + prev.irq + prev.softirq + prev.steal;
    unsigned long long currNonIdle = curr.user + curr.nice + curr.system + curr.irq + curr.softirq + curr.steal;

    unsigned long long prevTotal = prevIdle + prevNonIdle;
    unsigned long long currTotal = currIdle + currNonIdle;

    unsigned long long totalDiff = currTotal - prevTotal;
    unsigned long long idleDiff = currIdle - prevIdle;

    if (totalDiff == 0) return 0;
    return (int)((totalDiff - idleDiff) * 100 / totalDiff);
}

bool isOrchestratorAlive(const std::string& pidFile) {
    std::ifstream ifs(pidFile);
    if (!ifs.is_open()) return false;
    
    int pid;
    if (!(ifs >> pid)) return false;
    
    // Check if process exists and is actually the orchestrator
    // We use kill(pid, 0) for existence and then check /proc/pid/cmdline for truth
    if (kill(pid, 0) != 0) return false;
    
    std::ifstream cmdFile("/proc/" + std::to_string(pid) + "/cmdline");
    std::string cmd;
    std::getline(cmdFile, cmd);
    return (cmd.find("edgeOrchestrator.js") != std::string::npos);
}

// --- ATOMIC STATE WRITE ---

void writeHeartbeat(const SystemState& state, const std::string& path) {
    std::string tempPath = path + ".tmp";
    std::ofstream ofs(tempPath);
    if (!ofs.is_open()) return;

    ofs << "{"
        << "\"ts\":" << state.timestamp << ","
        << "\"hdd\":" << state.hdd_percent << ","
        << "\"cpu\":" << state.cpu_percent << ","
        << "\"mem\":" << state.mem_percent << ","
        << "\"orch\":" << (state.orchestrator_alive ? "true" : "false") << ","
        << "\"err\":" << (state.error ? "true" : "false")
        << "}" << std::endl;
    
    ofs.close();
    rename(tempPath.c_str(), path.c_str());
}

int main() {
    const std::string hbPath = "/tmp/dss-system.hb";
    const std::string pidFile = "/run/dss/orchestrator.pid";
    
    // Ensure run directory exists
    system("mkdir -p /run/dss");

    const char* recordPathEnv = getenv("DSS_RECORD_PATH");
    std::string storagePath = recordPathEnv ? recordPathEnv : "";

    // CPU Stabilization
    CPUData prevCPU = readCPU();
    bool stable = false;
    
    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(2));
        
        CPUData currCPU = readCPU();
        int cpuUsage = calculateCPU(prevCPU, currCPU);
        
        SystemState state;
        state.timestamp = (long)time(nullptr);
        state.error = storagePath.empty();
        
        state.hdd_percent = getHDDUsage(storagePath);
        state.cpu_percent = stable ? cpuUsage : 0;
        state.mem_percent = getMemoryUsage();
        state.orchestrator_alive = isOrchestratorAlive(pidFile);
        
        writeHeartbeat(state, hbPath);
        
        prevCPU = currCPU;
        stable = true; // First sample ignored
    }
    
    return 0;
}
