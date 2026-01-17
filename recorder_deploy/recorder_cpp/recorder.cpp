#include <iostream>
#include <filesystem>
#include <chrono>
#include <ctime>
#include <iomanip>
#include <fstream>
#include <sstream>
#include <thread>
#include <vector>
#include <csignal>
#include <unistd.h>
#include <fcntl.h>
#include <sys/wait.h>

namespace fs = std::filesystem;

static bool running = true;
void signalHandler(int signum) { running = false; }

std::string todayDate() {
    auto now = std::time(nullptr);
    std::tm tm = *std::localtime(&now);
    std::ostringstream ss;
    ss << std::put_time(&tm, "%Y-%m-%d");
    return ss.str();
}

int main(int argc, char* argv[]) {
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);

    std::string cameraId, rtspUrl, outRoot;
    int segmentSec = 3;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--camera-id" && i + 1 < argc) cameraId = argv[++i];
        else if (arg == "--rtsp" && i + 1 < argc) rtspUrl = argv[++i];
        else if (arg == "--out" && i + 1 < argc) outRoot = argv[++i];
        else if (arg == "--segment" && i + 1 < argc) segmentSec = std::stoi(argv[++i]);
    }

    if (cameraId.empty() || rtspUrl.empty() || outRoot.empty()) return 1;

    // PID Lock
    fs::path lockPath = fs::path("/tmp") / ("recorder_" + cameraId + ".lock");
    int fd = open(lockPath.c_str(), O_RDWR | O_CREAT, 0666);
    if (fd < 0 || lockf(fd, F_TLOCK, 0) < 0) {
        std::cerr << "{\"event\":\"error\",\"message\":\"Already running\"}\n";
        return 1;
    }

    std::string date = todayDate();
    fs::path dir = fs::path(outRoot) / cameraId / date;
    fs::create_directories(dir);

    std::ostringstream cmd;
    cmd << "ffmpeg -y -rtsp_transport tcp -i \"" << rtspUrl << "\" "
        << "-c:v copy -c:a copy "
        << "-f segment -segment_time " << segmentSec << " "
        << "-segment_format mp4 -segment_atclocktime 1 -reset_timestamps 1 "
        << "-movflags +faststart+frag_keyframe+empty_moov "
        << "\"" << dir.string() << "/seg_" << std::time(nullptr) << "_%d.mp4\" "
        << "-loglevel info 2>&1";

    std::cout << "{\"event\":\"recorder_starting\",\"camera\":\"" << cameraId << "\",\"path\":\"" << dir.string() << "\"}" << std::endl;

    FILE* pipe = popen(cmd.str().c_str(), "r");
    if (!pipe) return 1;

    char buffer[1024];
    while (running && fgets(buffer, sizeof(buffer), pipe)) {
        std::string line(buffer);
        if (line.find("Opening '") != std::string::npos && line.find(".mp4'") != std::string::npos) {
            size_t start = line.find("seg_");
            size_t end = line.find(".mp4'", start);
            if (start != std::string::npos && end != std::string::npos) {
                std::string fileOnly = line.substr(start, end - start + 4);
                std::cout << "{\"event\":\"segment_written\",\"camera\":\"" << cameraId 
                          << "\",\"file\":\"" << date << "/" << fileOnly 
                          << "\",\"ts\":" << std::time(nullptr) << "}" << std::endl;
            }
        }
    }

    int result = pclose(pipe);
    close(fd);
    fs::remove(lockPath);

    if (WIFEXITED(result)) {
        return WEXITSTATUS(result);
    }
    return 1;
}
