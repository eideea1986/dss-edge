#pragma once
#include <chrono>

struct Heartbeat {
    std::chrono::steady_clock::time_point last;
    
    void beat() {
        last = std::chrono::steady_clock::now();
    }
    
    bool expired(int seconds) {
        auto now = std::chrono::steady_clock::now();
        return std::chrono::duration_cast<std::chrono::seconds>(now - last).count() > seconds;
    }
};
