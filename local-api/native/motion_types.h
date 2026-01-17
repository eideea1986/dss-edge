#pragma once
#include <opencv2/opencv.hpp>
#include <vector>
#include <deque>
#include <string>

struct MotionBlob {
    cv::Rect bbox;
    double area;
    cv::Point2f centroid;
};

struct TrackedObject {
    std::string trackingId;
    cv::Rect bbox;
    int framesAlive = 0;
    double avgArea = 0.0;
    std::deque<cv::Point2f> centroidHistory;
    bool isStaticDynamic = false;
    cv::Rect smoothRoiState; // EMA state for ROI stabilization
};
