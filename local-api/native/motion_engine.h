#pragma once
#include <opencv2/opencv.hpp>
#include <vector>

struct EncodedROI {
    std::vector<uint8_t> jpeg;
    cv::Rect bbox;
    int objectId; // Pentru tracking consistency
};

class MotionEngine {
public:
    virtual ~MotionEngine() = default;

    // Inițializare context (alocare buffere GPU, stream-uri, etc)
    virtual void init(cv::Size frameSize) = 0;

    // Procesare frame: consumă frame -> produce ROI-uri encodate
    // Returnează true dacă totul e OK
    virtual bool processFrame(
        const cv::Mat& frameBgr,
        std::vector<EncodedROI>& output
    ) = 0;
};
