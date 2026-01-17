#pragma once
#include <opencv2/opencv.hpp>
#include <deque>
#include <algorithm> // for std::max, std::min

inline cv::Rect clampRect(const cv::Rect& r, const cv::Size& sz) {
    int x = std::max(0, r.x);
    int y = std::max(0, r.y);
    int w = std::min(r.width,  sz.width  - x);
    int h = std::min(r.height, sz.height - y);
    return cv::Rect(x, y, std::max(0,w), std::max(0,h));
}

inline cv::Rect expandRect(const cv::Rect& r, double padding, const cv::Size& sz) {
    int dx = static_cast<int>(r.width  * padding);
    int dy = static_cast<int>(r.height * padding);
    cv::Rect e(r.x - dx, r.y - dy, r.width + 2*dx, r.height + 2*dy);
    return clampRect(e, sz);
}

// EMA pentru stabilizare (anti-jitter)
inline cv::Rect smoothRectEMA(const cv::Rect& current,
                              cv::Rect& state,
                              double alpha = 0.3) {
    if (state.area() == 0) { state = current; return state; }
    state.x      = static_cast<int>(alpha*current.x      + (1.0-alpha)*state.x);
    state.y      = static_cast<int>(alpha*current.y      + (1.0-alpha)*state.y);
    state.width  = static_cast<int>(alpha*current.width  + (1.0-alpha)*state.width);
    state.height = static_cast<int>(alpha*current.height + (1.0-alpha)*state.height);
    return state;
}
