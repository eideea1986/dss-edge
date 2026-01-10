#include <iostream>
#include <thread>
#include <chrono>
#include <vector>
#include <string>
#include <atomic>
#include "RingBuffer.hpp"

// Forward declarations
void initIndexDB(const std::string& path);
void initAiDB(const std::string& path);
void startDecoder(const std::string& rtsp, const std::string& basePath);
void insertFrame(int64_t ts, bool key);
std::string nextSegmentPath(const std::string& base);

RingBuffer<FrameData> frameBuffer(2000);
std::atomic<bool> g_running{true};

int main(int argc, char** argv) {
    if (argc < 3) {
        std::cout << "Usage: ./recorder <rtsp_url> <base_path>" << std::endl;
        return 1;
    }

    std::string rtspUrl = argv[1];
    std::string basePath = argv[2];

    std::cout << "=== DSS SmartGuard Recorder V2.0 (C++) ===" << std::endl;
    std::cout << "[Main] URL: " << rtspUrl << std::endl;
    std::cout << "[Main] Path: " << basePath << std::endl;

    initIndexDB(basePath + "/index.db");
    initAiDB(basePath + "/ai.db");

    // The startDecoder is synchronous in our current implementation,
    // which is fine for a one-camera-per-process model.
    // If it becomes async, we'd wrap it in a thread.
    
    std::cout << "[Main] Starting Decoder..." << std::endl;
    startDecoder(rtspUrl, basePath);

    std::cout << "[Main] Decoder exited." << std::endl;

    return 0;
}
