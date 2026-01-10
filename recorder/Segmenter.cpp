#include <string>
#include <filesystem>
#include <atomic>
#include <iostream>

static std::atomic<int> segmentId{0};

std::string nextSegmentPath(const std::string& base) {
    if (!std::filesystem::exists(base + "/segments")) {
        std::filesystem::create_directories(base + "/segments");
    }
    char buf[64];
    sprintf(buf, "%06d.ts", segmentId.load());
    segmentId++;
    return base + "/segments/" + buf;
}
