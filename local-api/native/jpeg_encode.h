#pragma once
#include <opencv2/opencv.hpp>
#include <vector>
#include <algorithm>

inline bool encodeJPEG(const cv::Mat& bgr,
                       std::vector<uchar>& out,
                       int quality = 85) {
    if (bgr.empty()) return false;
    std::vector<int> params = {
        cv::IMWRITE_JPEG_QUALITY, std::clamp(quality, 50, 95)
    };
    return cv::imencode(".jpg", bgr, out, params);
}
