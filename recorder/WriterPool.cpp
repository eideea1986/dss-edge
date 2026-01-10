#include <thread>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <fstream>
#include <vector>
#include <iostream>

struct SegmentJob {
    std::string path;
    std::vector<uint8_t> data;
};

class WriterPool {
    std::queue<SegmentJob> jobs;
    std::mutex mtx;
    std::condition_variable cv;
    bool running = true;
    std::vector<std::thread> workers;

public:
    WriterPool(int workerCount) {
        for (int i = 0; i < workerCount; i++) {
            workers.emplace_back([this]() {
                while (running || !jobs.empty()) {
                    SegmentJob job;
                    {
                        std::unique_lock<std::mutex> lock(mtx);
                        cv.wait(lock, [&]{ return !jobs.empty() || !running; });
                        if (!running && jobs.empty()) return;
                        job = std::move(jobs.front());
                        jobs.pop();
                    }
                    std::ofstream f(job.path, std::ios::binary);
                    if (f.is_open()) {
                        f.write((char*)job.data.data(), job.data.size());
                        f.close();
                    } else {
                        std::cerr << "[WriterPool] Failed to open: " << job.path << std::endl;
                    }
                }
            });
        }
    }

    void submit(SegmentJob job) {
        std::lock_guard<std::mutex> lock(mtx);
        jobs.push(std::move(job));
        cv.notify_one();
    }

    ~WriterPool() {
        {
            std::lock_guard<std::mutex> lock(mtx);
            running = false;
        }
        cv.notify_all();
        for (auto& t : workers) {
            if (t.joinable()) t.join();
        }
    }
};
