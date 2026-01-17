#pragma once
#include "motion_engine.h"
#include <opencv2/core/ocl.hpp>

class OpenClMotionEngine : public MotionEngine {
public:
    void init(cv::Size frameSize) override;
    bool processFrame(const cv::Mat& frame, std::vector<EncodedROI>& out) override;

private:
    cv::UMat uFrame, uGray, uDiff, uBackground, uThresh;
    bool backgroundInit = false;
    cv::Size size;
    // Simplificat: Reimplementăm logica de detecție folosind UMat direct
    // pentru a evita transferul memoriei CPU <-> GPU
};
