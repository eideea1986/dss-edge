#pragma once
#include <opencv2/opencv.hpp>
#include <vector>

struct ExcludedZone {
    cv::Rect zone; // pixeli
};

struct CameraConfig {
    double minAreaRatio = 0.02;     // 2% din ecran
    int minFrames = 3;              // redus pt snapshot polling (3 frames @ 1s = 3s persistenta)
    double maxStaticVariance = 3.0; // Variance for static dynamic
    double roiPadding = 0.2;
    std::vector<ExcludedZone> excludedZones;
};
