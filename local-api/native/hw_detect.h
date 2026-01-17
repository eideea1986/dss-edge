#pragma once
#include <string>
#include <cstdlib>
#include <iostream>

enum class GpuType {
    NVIDIA,
    INTEL_IGPU,
    AMD_IGPU,
    UNKNOWN
};

inline GpuType detectGpu() {
    // 1. NVIDIA CUDA Check
    // Verificăm prezența nvidia-smi
    if (std::system("which nvidia-smi > /dev/null 2>&1") == 0) {
        // Opțional: verificăm dacă returnează succes la execuție
        if (std::system("nvidia-smi > /dev/null 2>&1") == 0) {
            return GpuType::NVIDIA;
        }
    }

    // 2. Intel iGPU (VAAPI / Render Nodes)
    // Verificăm device-urile DRI specifice Intel
    if (std::system("ls /dev/dri/renderD* > /dev/null 2>&1") == 0) {
        // Verificare rapidă vendor via lspci
        if (std::system("lspci | grep -i 'VGA.*Intel' > /dev/null 2>&1") == 0 ||
            std::system("lspci | grep -i 'Display.*Intel' > /dev/null 2>&1") == 0) {
            return GpuType::INTEL_IGPU;
        }
    }

    // 3. AMD iGPU / GPU
    if (std::system("lspci | grep -i 'VGA.*AMD' > /dev/null 2>&1") == 0) {
        return GpuType::AMD_IGPU;
    }

    return GpuType::UNKNOWN;
}
