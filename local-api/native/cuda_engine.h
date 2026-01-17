#pragma once
#include "motion_engine.h"

#ifdef DSS_ENABLE_CUDA
#include <opencv2/cudaimgproc.hpp>
#include <opencv2/cudawarping.hpp>
#include <opencv2/cudaarithm.hpp>
#include <opencv2/cudafilters.hpp>
// #include <nvjpeg.h> // Needs NVJPEG lib
#endif

class CudaMotionEngine : public MotionEngine {
public:
    void init(cv::Size frameSize) override;
    bool processFrame(const cv::Mat& frame, std::vector<EncodedROI>& out) override;

private:
#ifdef DSS_ENABLE_CUDA
    cv::cuda::GpuMat gpuFrame, gpuGray, gpuBackground, gpuDiff, gpuThresh;
    cv::Ptr<cv::cuda::Filter> blurFilter;
    bool backgroundInit = false;
    // nvjpegHandle_t nvjpeg;
#endif
};
