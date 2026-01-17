#include "cuda_engine.h"
#include <iostream>

void CudaMotionEngine::init(cv::Size frameSize) {
#ifdef DSS_ENABLE_CUDA
    // nvjpegCreateSimple(&nvjpeg);
    blurFilter = cv::cuda::createGaussianFilter(CV_8UC1, CV_8UC1, cv::Size(21, 21), 0);
#else
    std::cerr << "[CUDA] Not compiled in binary." << std::endl;
#endif
}

bool CudaMotionEngine::processFrame(const cv::Mat& frame, std::vector<EncodedROI>& out) {
#ifdef DSS_ENABLE_CUDA
    if (frame.empty()) return false;

    // Upload
    gpuFrame.upload(frame);
    cv::cuda::cvtColor(gpuFrame, gpuGray, cv::COLOR_BGR2GRAY);

    // Filter
    blurFilter->apply(gpuGray, gpuGray);

    if (!backgroundInit) {
        gpuGray.copyTo(gpuBackground);
        backgroundInit = true;
        return true;
    }

    // Diff
    cv::cuda::absdiff(gpuGray, gpuBackground, gpuDiff);
    cv::cuda::threshold(gpuDiff, gpuThresh, 25, 255, cv::THRESH_BINARY);
    
    // Background Update
    cv::cuda::addWeighted(gpuBackground, 0.90, gpuGray, 0.10, 0, gpuBackground);

    // Download Mask for Contour (contour is CPU)
    cv::Mat maskCpu;
    gpuThresh.download(maskCpu);

    // ... Contour extraction same as CPU/OpenCL ...
    // ... NVJPEG encoding would go here ...
    
    return true;
#else
    return false;
#endif
}
