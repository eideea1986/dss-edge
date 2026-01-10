#pragma once
#include <deque>
#include <mutex>
#include <vector>

struct FrameData {
    int64_t pts;
    bool keyframe;
    std::vector<uint8_t> data;
    int stream_index;
};

template<typename T>
class RingBuffer {
    std::deque<T> buffer;
    std::mutex mtx;
    size_t maxSize;

public:
    RingBuffer(size_t max) : maxSize(max) {}

    void push(const T& item) {
        std::lock_guard<std::mutex> lock(mtx);
        buffer.push_back(item);
        if (buffer.size() > maxSize)
            buffer.pop_front();
    }

    std::deque<T> snapshot() {
        std::lock_guard<std::mutex> lock(mtx);
        std::deque<T> copy = buffer;
        buffer.clear(); // Clear after snapshot for the recorder logic to consume
        return copy;
    }

    size_t size() {
        std::lock_guard<std::mutex> lock(mtx);
        return buffer.size();
    }
};
