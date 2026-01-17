#pragma once
#include "hw_detect.h"
#include "cuda_engine.h"
#include "opencl_engine.h"
#include "cpu_engine.h"
#include <memory>
#include <iostream>

inline std::unique_ptr<MotionEngine> createEngine() {
    GpuType gpu = detectGpu();

    switch (gpu) {
        case GpuType::NVIDIA:
#ifdef DSS_ENABLE_CUDA
            std::cout << "[Engine] Detected NVIDIA GPU. Loading CUDA Engine..." << std::endl;
            return std::make_unique<CudaMotionEngine>();
#else
            std::cout << "[Engine] Detected NVIDIA GPU but CUDA not compiled. Fallback to CPU." << std::endl;
            return std::make_unique<CpuMotionEngine>();
#endif

        case GpuType::INTEL_IGPU:
            std::cout << "[Engine] Detected Intel iGPU. Loading OpenCL Engine..." << std::endl;
            return std::make_unique<OpenClMotionEngine>();

        case GpuType::AMD_IGPU:
            std::cout << "[Engine] Detected AMD GPU. Loading OpenCL Engine..." << std::endl;
            return std::make_unique<OpenClMotionEngine>();

        default:
            std::cout << "[Engine] No specific GPU detected. Loading Optimized CPU Engine..." << std::endl;
            return std::make_unique<CpuMotionEngine>();
    }
}
