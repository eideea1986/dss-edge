#pragma once
#include <opencv2/opencv.hpp>
#include "roi_utils.h"

inline cv::Mat cropROI(const cv::Mat& frame,
                       const cv::Rect& bbox,
                       double padding,
                       cv::Rect& smoothState) {
    cv::Rect expanded = expandRect(bbox, padding, frame.size());
    cv::Rect stabilized = smoothRectEMA(expanded, smoothState);
    cv::Rect safe = clampRect(stabilized, frame.size());
    if (safe.area() <= 0) return cv::Mat();
    return frame(safe).clone(); // clone pentru siguranță thread
}
