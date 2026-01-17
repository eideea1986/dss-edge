#include "opencl_engine.h"
#include "jpeg_encode.h"
#include "roi_utils.h"

void OpenClMotionEngine::init(cv::Size frameSize) {
    this->size = frameSize;
    if (!cv::ocl::haveOpenCL()) {
        std::cerr << "[OpenCL] Warning: OpenCL not available, UMat will run on CPU." << std::endl;
    }
    cv::ocl::setUseOpenCL(true);
}

bool OpenClMotionEngine::processFrame(const cv::Mat& frame, std::vector<EncodedROI>& out) {
    if (frame.empty()) return false;

    // Upload to GPU (Transparent API handling)
    frame.copyTo(uFrame);

    if (uFrame.channels() == 3) {
        cv::cvtColor(uFrame, uGray, cv::COLOR_BGR2GRAY);
    } else {
        uFrame.copyTo(uGray);
    }

    // Gaussian Blur on GPU
    cv::GaussianBlur(uGray, uGray, cv::Size(21, 21), 0);

    if (!backgroundInit) {
        uGray.copyTo(uBackground);
        backgroundInit = true;
        return true; 
    }

    // Motion Diff on GPU
    cv::absdiff(uGray, uBackground, uDiff);
    cv::threshold(uDiff, uThresh, 25, 255, cv::THRESH_BINARY);
    cv::dilate(uThresh, uThresh, cv::UMat(), cv::Point(-1,-1), 2);

    // Background Update on GPU
    cv::addWeighted(uBackground, 0.90, uGray, 0.10, 0, uBackground);

    // Download contours to CPU (contours are vector logic, better on CPU)
    // We need to fetch the mask to CPU to find contours
    cv::Mat maskCpu;
    uThresh.copyTo(maskCpu);

    std::vector<std::vector<cv::Point>> contours;
    cv::findContours(maskCpu, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

    // Filter & Encode
    double frameArea = (double)size.width * size.height;
    
    for (const auto& c : contours) {
        cv::Rect r = cv::boundingRect(c);
        double area = cv::contourArea(c);
        
        if (area / frameArea < 0.005) continue; // Min size filter

        // Crop ROI
        // Prefer extracting small ROI from UMat? 
        // Or using the CPU frame copy we have?
        // Using CPU copy avoids small transfers overhead.
        
        cv::Rect safeRoi = clampRect(expandRect(r, 0.2, size), size);
        cv::Mat roiCpu = frame(safeRoi); // Utilizăm cadrul original din RAM

        if (roiCpu.empty()) continue;

        out.emplace_back();
        out.back().bbox = r;
        encodeJPEG(roiCpu, out.back().jpeg, 85);
    }

    return true;
}
