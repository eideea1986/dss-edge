#pragma once
#include <unistd.h>
#include <sys/wait.h>
#include <signal.h>
#include <string>
#include <iostream>

struct Process {
    pid_t pid = -1;
    std::string name;
    std::string cmd;
    
    bool start() {
        pid = fork();
        if (pid == 0) {
            // Child process
            execl("/bin/sh", "sh", "-c", cmd.c_str(), nullptr);
            _exit(1); // If exec fails
        }
        return pid > 0;
    }
    
    bool isAlive() {
        if (pid <= 0) return false;
        return kill(pid, 0) == 0;
    }
    
    void stop() {
        if (pid > 0) {
            kill(pid, SIGTERM);
            sleep(2);
            if (isAlive()) kill(pid, SIGKILL);
        }
    }
    
    bool waitExit(int* status) {
        return waitpid(pid, status, WNOHANG) > 0;
    }
};
