#pragma once
#include "motion_types.h"
#include "camera_config.h"

class MotionDetector {
public:
    MotionDetector(const CameraConfig& cfg, cv::Size frameSize);

    // Returns Valid ROI (if any)
    std::vector<TrackedObject> processFrame(const cv::Mat& frame);
    void updateConfig(const CameraConfig& newCfg);
    const CameraConfig& getConfig() const { return config; }

private:
    CameraConfig config;
    cv::Size frameSize;

    cv::Mat background;
    bool backgroundInit = false;

    std::vector<TrackedObject> tracks;

    cv::Mat detectMotion(const cv::Mat& frame);
    void applyExcludedZones(cv::Mat& mask);
    std::vector<MotionBlob> extractBlobs(const cv::Mat& mask);

    bool passesSizeFilter(const MotionBlob& blob);
    TrackedObject* updateOrCreateTrack(const MotionBlob& blob);
    bool passesPersistence(const TrackedObject& track);
    bool isStaticDynamic(TrackedObject& track);
};
