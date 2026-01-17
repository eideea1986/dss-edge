#include "motion_detector.h"
#include <numeric>

#include "motion_detector.h"
#include <numeric>
#include "hw_detect.h"

MotionDetector::MotionDetector(const CameraConfig& cfg, cv::Size size)
    : config(cfg), frameSize(size) {
    
    GpuType gpu = detectGpu();
    const char* gpuStr = "UNKNOWN";
    switch(gpu) {
        case GpuType::NVIDIA: gpuStr = "NVIDIA GPU (CUDA Avail)"; break;
        case GpuType::INTEL_IGPU: gpuStr = "Intel iGPU (OpenCL Ready)"; break;
        case GpuType::AMD_IGPU: gpuStr = "AMD GPU"; break;
        default: gpuStr = "CPU Fallback"; break;
    }
    std::cout << "[MotionDetector] Initialized on HW: " << gpuStr << std::endl;
}

void MotionDetector::updateConfig(const CameraConfig& newCfg) {
    this->config = newCfg;
}

cv::Mat MotionDetector::detectMotion(const cv::Mat& frame) {
    cv::Mat gray, diff, thresh;
    if (frame.channels() == 3) {
        cv::cvtColor(frame, gray, cv::COLOR_BGR2GRAY);
    } else {
        gray = frame.clone();
    }

    // Gaussian Blur to reduce noise
    cv::GaussianBlur(gray, gray, cv::Size(21, 21), 0);

    if (!backgroundInit) {
        gray.copyTo(background);
        backgroundInit = true;
        return cv::Mat::zeros(gray.size(), CV_8U);
    }

    cv::absdiff(gray, background, diff);
    cv::threshold(diff, thresh, 25, 255, cv::THRESH_BINARY);

    cv::dilate(thresh, thresh, cv::Mat(), cv::Point(-1,-1), 2);

    // Background learning (MOG approach simplified)
    cv::addWeighted(background, 0.99, gray, 0.01, 0, background);

    return thresh;
}

void MotionDetector::applyExcludedZones(cv::Mat& mask) {
    for (const auto& z : config.excludedZones) {
        // Ensure zone is within bounds
        cv::Rect safeZone = z.zone & cv::Rect(0, 0, mask.cols, mask.rows);
        if (safeZone.area() > 0) {
            mask(safeZone).setTo(0);
        }
    }
}

std::vector<MotionBlob> MotionDetector::extractBlobs(const cv::Mat& mask) {
    std::vector<std::vector<cv::Point>> contours;
    cv::findContours(mask, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

    std::vector<MotionBlob> blobs;
    for (const auto& c : contours) {
        cv::Rect r = cv::boundingRect(c);
        double area = cv::contourArea(c);
        
        if (r.area() == 0) continue;

        cv::Point2f centroid(
            r.x + r.width / 2.0f,
            r.y + r.height / 2.0f
        );
        blobs.push_back({r, area, centroid});
    }
    return blobs;
}

bool MotionDetector::passesSizeFilter(const MotionBlob& blob) {
    double frameArea = (double)frameSize.width * frameSize.height;
    return (blob.area / frameArea) >= config.minAreaRatio;
}

TrackedObject* MotionDetector::updateOrCreateTrack(const MotionBlob& blob) {
    const float MAX_DIST = 50.0f; // Pixels

    // Match existing
    for (auto& t : tracks) {
        // Predict next position could be here? For now just simple distance
        if (!t.centroidHistory.empty()) {
            double dist = cv::norm(t.centroidHistory.back() - blob.centroid);
            if (dist < MAX_DIST) {
                t.bbox = blob.bbox;
                t.framesAlive++;
                t.centroidHistory.push_back(blob.centroid);
                if (t.centroidHistory.size() > 30)
                    t.centroidHistory.pop_front();

                // Reset logic for static if it moved suddenly? No, keep history.
                return &t;
            }
        }
    }

    // Create new
    TrackedObject t;
    t.trackingId = std::to_string(cv::getTickCount());
    t.bbox = blob.bbox;
    t.framesAlive = 1;
    t.centroidHistory.push_back(blob.centroid);
    tracks.push_back(t);
    return &tracks.back();
}

bool MotionDetector::passesPersistence(const TrackedObject& track) {
    return track.framesAlive >= config.minFrames;
}

bool MotionDetector::isStaticDynamic(TrackedObject& track) {
    if (track.centroidHistory.size() < 4) return false; // Need history

    // Calculate Variance
    double meanX = 0, meanY = 0;
    for (auto& p : track.centroidHistory) {
        meanX += p.x;
        meanY += p.y;
    }
    meanX /= track.centroidHistory.size();
    meanY /= track.centroidHistory.size();

    double var = 0;
    for (auto& p : track.centroidHistory) {
        var += (p.x - meanX)*(p.x - meanX) + (p.y - meanY)*(p.y - meanY);
    }
    var /= track.centroidHistory.size(); // Mean Squared Error from Centroid

    // User Rule: If variance Low AND exists for long time -> Static Dynamic
    if (var < config.maxStaticVariance && track.framesAlive > config.minFrames) {
        track.isStaticDynamic = true;
        return true;
    }
    return false;
}

std::vector<TrackedObject> MotionDetector::processFrame(const cv::Mat& frame) {
    // 1. Update internal frame size to match actual input resolution
    if (frame.size() != this->frameSize) {
        this->frameSize = frame.size();
        // Reset background if size changed to avoid crash?
        // OpenCV handles reallocation usually but let's be safe
        if (!background.empty() && background.size() != frame.size()) {
             backgroundInit = false; // Re-learn background
        }
    }

    std::vector<TrackedObject> valid;

    cv::Mat mask = detectMotion(frame);
    applyExcludedZones(mask);

    int nonZero = cv::countNonZero(mask);
    if (nonZero == 0) {
        std::cout << "[Native] Mask Zero for ID " << tracks.size() << std::endl;
        return valid;
    }

    auto blobs = extractBlobs(mask);
    
    std::cout << "[Native] Blobs: " << blobs.size() << " NonZero: " << nonZero << std::endl;

    std::vector<TrackedObject> updatedTracks;

    // Radius proportional to resolution (e.g. 50px at 640w => ~8%)
    double maxMatchDist = (double)frame.cols * 0.08; 
    if (maxMatchDist < 20.0) maxMatchDist = 20.0; // Minimum floor

    // Try to match existing tracks to blobs
    for (auto& track : tracks) {
        int bestBlobIdx = -1;
        double minDst = 100000.0;
        
        for (int i=0; i<blobs.size(); ++i) {
            if (blobs[i].area == -1) continue; // Already matched to previous track

             double dist = cv::norm(track.centroidHistory.back() - blobs[i].centroid);
             if (dist < maxMatchDist && dist < minDst) {
                 minDst = dist;
                 bestBlobIdx = i;
             }
        }

        if (bestBlobIdx != -1) {
            // Update Track
            MotionBlob& b = blobs[bestBlobIdx];
            track.bbox = b.bbox;
            track.framesAlive++;
            track.centroidHistory.push_back(b.centroid);
             if (track.centroidHistory.size() > 30) track.centroidHistory.pop_front();
            
            updatedTracks.push_back(track);
            
            // Mark blob as used
             blobs[bestBlobIdx].area = -1; 
            
            // Check filters
            if (passesSizeFilter(b) && passesPersistence(track) && !isStaticDynamic(track)) {
                valid.push_back(track);
            }
        }
        // Else track is lost? We drop it here (simple logic). 
        // Ideally we should keep it for 1-2 frames (occlusion).
    }

    // Create new tracks for unmatched blobs
    for (const auto& b : blobs) {
        if (b.area == -1) continue; // used
        
        // Initial Size Filter for creation?
        if (!passesSizeFilter(b)) continue; 
        
        TrackedObject t;
        t.trackingId = std::to_string(cv::getTickCount() + rand()); 
        t.bbox = b.bbox;
        t.framesAlive = 1;
        t.centroidHistory.push_back(b.centroid);
        
        updatedTracks.push_back(t);
    }

    this->tracks = updatedTracks;
    return valid;
}
