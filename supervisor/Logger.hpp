#pragma once
#include <fstream>
#include <string>
#include <ctime>
#include <iostream>

class Logger {
    std::ofstream file;
    
public:
    Logger(const std::string& path) {
        file.open(path, std::ios::app);
        if (!file.is_open()) {
            std::cerr << "Failed to open log file: " << path << std::endl;
        }
    }
    
    ~Logger() {
        if (file.is_open()) file.close();
    }
    
    void log(const std::string& msg) {
        if (!file.is_open()) return;
        
        time_t t = time(nullptr);
        char timestamp[64];
        strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", localtime(&t));
        
        file << "[" << timestamp << "] " << msg << std::endl;
        file.flush();
        
        // Also print to stdout for systemd journal
        std::cout << "[Supervisor] " << msg << std::endl;
    }
};
