#!/bin/bash
echo "Building Enterprise Motion Filter..."

# Detectam daca putem compila CUDA (prezenta nvcc sau headers)
# Pentru simplificare, verificam doar daca userul vrea (implicit OFF pe acest server Intel)
ENABLE_CUDA=0

SRCS="motion_lib.cpp motion_detector.cpp opencl_engine.cpp cuda_engine.cpp"

# steaguri standard
CXXFLAGS="-shared -fPIC -O3 -std=c++17"
INCLUDES="-I/usr/include/opencv4"
LIBS="-lopencv_core -lopencv_imgproc -lopencv_highgui -lopencv_imgcodecs -lopencv_video" 
# Adaugat opencv_video pentru MOG2 daca e cazul, sau unii algoritmi

if [ "$ENABLE_CUDA" -eq "1" ]; then
    CXXFLAGS="$CXXFLAGS -DDSS_ENABLE_CUDA"
    # LIBS need nvjpeg etc
fi

# Linkam si OpenCL (parte din opencv_core de obicei transparent, dar verificam)
# OpenCV handleuiește OpenCL intern, nu avem nevoie de -lOpenCL explicit de multe ori daca e prin cv::ocl

echo "Compiling with sources: $SRCS"

g++ $CXXFLAGS -o libmotionfilter.so $SRCS $INCLUDES $LIBS

if [ $? -eq 0 ]; then
    echo "BUILD SUCCESS"
    ls -l libmotionfilter.so
else
    echo "BUILD FAILED"
fi

echo "Checking Koffi..."
ls -d ../node_modules/koffi
