#pragma once
#include "motion_engine.h"
#include "motion_detector.h" // Logica de detecție existentă
#include "roi_crop.h"
#include "jpeg_encode.h"

class CpuMotionEngine : public MotionEngine {
public:
    void init(cv::Size frameSize) override {
        // Inițializăm detectorul clasic CPU
        CameraConfig cfg; // Default config
        detector = std::make_unique<MotionDetector>(cfg, frameSize);
        this->size = frameSize;
    }

    bool processFrame(const cv::Mat& frame, std::vector<EncodedROI>& out) override {
        if (frame.empty()) return false;

        // 1. Detect Motion & Track
        auto tracks = detector->processFrame(frame);

        // 2. Crop & Encode ROI for Valid Tracks
        for (auto& track : tracks) {
            // Folosim ROI utils definite anterior
            cv::Mat roi = cropROI(frame, track.bbox, 0.2, track.smoothRoiState);
            
            if (roi.empty()) continue;

            out.emplace_back();
            EncodedROI& item = out.back();
            item.bbox = track.bbox;
            // item.objectId = std::stoi(track.trackingId); // ID mapping logic needed

            // Encode logic
            encodeJPEG(roi, item.jpeg, 85);
        }
        return true;
    }

private:
    std::unique_ptr<MotionDetector> detector;
    cv::Size size;
};
