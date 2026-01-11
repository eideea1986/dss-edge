#!/bin/bash
# DSS-Edge Production Packaging Script
# Creates clean deployment package WITHOUT development files

set -e

VERSION="1.3.0"
PACKAGE_NAME="dss-edge-${VERSION}-production"
BUILD_DIR="./build-package"
SOURCE_DIR="."

echo "=== DSS-Edge Production Packaging ==="
echo "Version: ${VERSION}"
echo ""

# Clean previous build
rm -rf ${BUILD_DIR}
mkdir -p ${BUILD_DIR}/${PACKAGE_NAME}

echo "1. Copying core binaries..."
mkdir -p ${BUILD_DIR}/${PACKAGE_NAME}/bin
# Binaries will be compiled on target system

echo "2. Copying C++ source (for compilation on target)..."
mkdir -p ${BUILD_DIR}/${PACKAGE_NAME}/recorder
cp ${SOURCE_DIR}/recorder/*.cpp ${BUILD_DIR}/${PACKAGE_NAME}/recorder/
cp ${SOURCE_DIR}/recorder/*.hpp ${BUILD_DIR}/${PACKAGE_NAME}/recorder/
cp ${SOURCE_DIR}/recorder/CMakeLists.txt ${BUILD_DIR}/${PACKAGE_NAME}/recorder/

mkdir -p ${BUILD_DIR}/${PACKAGE_NAME}/supervisor
cp ${SOURCE_DIR}/supervisor/*.cpp ${BUILD_DIR}/${PACKAGE_NAME}/supervisor/
cp ${SOURCE_DIR}/supervisor/*.hpp ${BUILD_DIR}/${PACKAGE_NAME}/supervisor/
cp ${SOURCE_DIR}/supervisor/CMakeLists.txt ${BUILD_DIR}/${PACKAGE_NAME}/supervisor/

# Exclude deprecated playback versions
rm -f ${BUILD_DIR}/${PACKAGE_NAME}/recorder/PlaybackEngine.cpp
rm -f ${BUILD_DIR}/${PACKAGE_NAME}/recorder/PlaybackEngineV2.cpp
rm -f ${BUILD_DIR}/${PACKAGE_NAME}/recorder/PlaybackEngineV3.cpp

echo "3. Copying Node.js control plane (NO video processing)..."
mkdir -p ${BUILD_DIR}/${PACKAGE_NAME}/orchestrator
cp ${SOURCE_DIR}/orchestrator/edgeOrchestrator.js ${BUILD_DIR}/${PACKAGE_NAME}/orchestrator/

mkdir -p ${BUILD_DIR}/${PACKAGE_NAME}/local-api
cp -r ${SOURCE_DIR}/local-api/routes ${BUILD_DIR}/${PACKAGE_NAME}/local-api/
cp -r ${SOURCE_DIR}/local-api/services ${BUILD_DIR}/${PACKAGE_NAME}/local-api/
cp -r ${SOURCE_DIR}/local-api/store ${BUILD_DIR}/${PACKAGE_NAME}/local-api/
cp -r ${SOURCE_DIR}/local-api/playback ${BUILD_DIR}/${PACKAGE_NAME}/local-api/
cp ${SOURCE_DIR}/local-api/server.js ${BUILD_DIR}/${PACKAGE_NAME}/local-api/
cp ${SOURCE_DIR}/local-api/package.json ${BUILD_DIR}/${PACKAGE_NAME}/local-api/

mkdir -p ${BUILD_DIR}/${PACKAGE_NAME}/camera-manager
cp ${SOURCE_DIR}/camera-manager/index.js ${BUILD_DIR}/${PACKAGE_NAME}/camera-manager/
cp ${SOURCE_DIR}/camera-manager/lifecycle.js ${BUILD_DIR}/${PACKAGE_NAME}/camera-manager/
cp ${SOURCE_DIR}/camera-manager/package.json ${BUILD_DIR}/${PACKAGE_NAME}/camera-manager/

echo "4. Copying UI build..."
mkdir -p ${BUILD_DIR}/${PACKAGE_NAME}/local-ui
if [ -d "${SOURCE_DIR}/local-ui/build" ]; then
    cp -r ${SOURCE_DIR}/local-ui/build ${BUILD_DIR}/${PACKAGE_NAME}/local-ui/
else
    echo "  ⚠ UI not built, run 'cd local-ui && npm run build' first"
fi

echo "5. Copying systemd service..."
cp ${SOURCE_DIR}/dss-supervisor.service ${BUILD_DIR}/${PACKAGE_NAME}/

echo "6. Copying documentation..."
cp ${SOURCE_DIR}/ARCHITECTURE.md ${BUILD_DIR}/${PACKAGE_NAME}/
cp ${SOURCE_DIR}/README.md ${BUILD_DIR}/${PACKAGE_NAME}/ 2>/dev/null || echo "  (README.md not found, skipping)"

echo "7. Creating installation script..."
cat > ${BUILD_DIR}/${PACKAGE_NAME}/install.sh << 'EOF'
#!/bin/bash
# DSS-Edge Installation Script

set -e

echo "=== DSS-Edge Installation ==="

# 1. Install system dependencies
echo "1. Installing dependencies..."
apt-get update
apt-get install -y build-essential cmake \
    libavformat-dev libavcodec-dev libavutil-dev libswscale-dev \
    libsqlite3-dev nodejs npm

# 2. Compile recorder
echo "2. Compiling recorder..."
cd recorder
mkdir -p build && cd build
cmake ..
make -j$(nproc)
cp recorder /usr/bin/recorder
cp playback_server /usr/bin/playback_server
chmod +x /usr/bin/recorder /usr/bin/playback_server
cd ../..

# 3. Compile supervisor
echo "3. Compiling supervisor..."
cd supervisor
mkdir -p build && cd build
cmake ..
make -j$(nproc)
cp dss-supervisor /usr/bin/dss-supervisor
chmod +x /usr/bin/dss-supervisor
cd ../..

# 4. Install Node.js dependencies
echo "4. Installing Node.js dependencies..."
cd local-api && npm install --production && cd ..
cd camera-manager && npm install --production && cd ..

# 5. Create directories
echo "5. Creating directories..."
mkdir -p /opt/dss-edge/storage
mkdir -p /opt/dss-edge/config
mkdir -p /var/log/dss-edge

# 6. Copy files
echo "6. Copying application files..."
cp -r ./* /opt/dss-edge/

# 7. Install systemd service
echo "7. Installing systemd service..."
cp dss-supervisor.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable dss-supervisor

echo ""
echo "✅ Installation complete!"
echo ""
echo "To start the system:"
echo "  systemctl start dss-supervisor"
echo "  systemctl status dss-supervisor"
echo ""
echo "UI will be available at: http://<server-ip>:8080"
EOF

chmod +x ${BUILD_DIR}/${PACKAGE_NAME}/install.sh

echo "8. Creating tarball..."
cd ${BUILD_DIR}
tar -czf ${PACKAGE_NAME}.tar.gz ${PACKAGE_NAME}
cd ..

echo ""
echo "✅ Package created: ${BUILD_DIR}/${PACKAGE_NAME}.tar.gz"
echo ""
echo "Contents:"
tar -tzf ${BUILD_DIR}/${PACKAGE_NAME}.tar.gz | head -n 20
echo "..."
echo ""
echo "To deploy:"
echo "  1. Copy ${PACKAGE_NAME}.tar.gz to target server"
echo "  2. tar -xzf ${PACKAGE_NAME}.tar.gz"
echo "  3. cd ${PACKAGE_NAME}"
echo "  4. sudo ./install.sh"
