#!/bin/bash

echo "==============================================="
echo "   DSS SmartGuard EDGE – Install Script"
echo "==============================================="

# 1. Update system
# apt update && apt upgrade -y

# 2. Install Node.js 18
echo "[DSS] Skipping Node.js install (Already installed)..."
# curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
# apt install -y nodejs unzip

# 3. Install Python + PIP
echo "[DSS] Skipping Python install..."
# apt install -y python3 python3-pip python3-venv

# 4. Install FFmpeg
echo "[DSS] Installing FFmpeg..."
apt install -y ffmpeg

# 5. Install Tailscale
if ! command -v tailscale &> /dev/null; then
    echo "[DSS] Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
else
    echo "[DSS] Tailscale already installed. Skipping."
fi

# 5b. Install Go2RTC
if [ ! -f "/usr/local/bin/go2rtc" ]; then
    echo "[DSS] Installing Go2RTC..."
    curl -L https://github.com/AlexxIT/go2rtc/releases/download/v1.9.8/go2rtc_linux_amd64 -o /usr/local/bin/go2rtc
    chmod +x /usr/local/bin/go2rtc
else
    echo "[DSS] Go2RTC already installed. Skipping."
fi

# 6. Create main directory
echo "[DSS] Creating /opt/dss-edge..."
mkdir -p /opt/dss-edge
chmod 777 /opt/dss-edge

# ... (omitted copy logic for brevity, assuming it remains or is handled by the user's specific workflow updates if any) ...
# Note: The tool only replaces the targeted block. I need to target the NPM section separately or be careful with the range.
# Let's verify the line numbers for the NPM section in a separate call or try to capture it if it's close.
# The NPM section started around line 103 in previous view.
# I will output the start of the file modifications first.

# 7. Copy project files
# 7. Copy project files
# Check if we are inside the extracted directory (flat structure)
if [ -d "orchestrator" ] && [ -d "local-api" ]; then
    echo "[DSS] Detected flat directory structure..."
    
    current_dir=$(pwd)
    if [ "$current_dir" == "/opt/dss-edge" ]; then
        echo "[DSS] Running inside install directory. Skipping self-copy."
    else
        echo "[DSS] Copying from current dir to /opt/dss-edge..."
        
        # Backup config if exists
        if [ -f "/opt/dss-edge/config/cameras.json" ]; then
            cp /opt/dss-edge/config/cameras.json /tmp/cameras_backup.json
        fi
        if [ -f "/opt/dss-edge/config/edge.json" ]; then
            cp /opt/dss-edge/config/edge.json /tmp/edge_backup.json
        fi
        if [ -f "/opt/dss-edge/event-engine/dispatch.json" ]; then
            cp /opt/dss-edge/event-engine/dispatch.json /tmp/dispatch_backup.json
        fi

        # Copy all files from current dir to /opt/dss-edge
        cp -r * /opt/dss-edge/
        
        # Restore configs
        if [ -f "/tmp/cameras_backup.json" ]; then
            mv /tmp/cameras_backup.json /opt/dss-edge/config/cameras.json
            echo "[DSS] Restored cameras.json backup."
        fi
        if [ -f "/tmp/edge_backup.json" ]; then
            mv /tmp/edge_backup.json /opt/dss-edge/config/edge.json
            echo "[DSS] Restored edge.json backup."
        fi
        if [ -f "/tmp/dispatch_backup.json" ]; then
            # Ensure dir exists
            mkdir -p /opt/dss-edge/event-engine
            mv /tmp/dispatch_backup.json /opt/dss-edge/event-engine/dispatch.json
            echo "[DSS] Restored dispatch.json backup."
        fi
    fi

elif [ -d "edge" ]; then
    echo "[DSS] Copying files from edge/ subdir..."
    # Backup config if exists
    # if [ -f "/opt/dss-edge/config/cameras.json" ]; then
    #     cp /opt/dss-edge/config/cameras.json /tmp/cameras_backup.json
    # fi
    
    cp -r edge/* /opt/dss-edge/
    
    # Restore config
    # if [ -f "/tmp/cameras_backup.json" ]; then
    #     mv /tmp/cameras_backup.json /opt/dss-edge/config/cameras.json
    #     echo "[DSS] Restored cameras.json backup."
    # fi
elif [ -f "dss_edge.zip" ]; then
    echo "[DSS] Extracting project ZIP..."
    unzip -o -q dss_edge.zip -d /opt/
    # If zip contains 'edge' folder at root, moving contents might be needed
    # assuming zip extracts to /opt/edge, rename to dss-edge if needed
    if [ -d "/opt/edge" ]; then
        cp -r /opt/edge/* /opt/dss-edge/
        rm -rf /opt/edge
    fi
else
    echo "[DSS] WARNING: Source files not found (checked current dir, 'edge' dir, 'dss_edge.zip'). Skipping copy."
    # We continue assuming files were placed manually or will be
fi

# 8. Install Node modules
echo "[DSS] Updating Node modules (Build only)..."
cd /opt/dss-edge
ls -la # DEBUG CHECK

echo "[DSS] Installing root dependencies..."
if [ -f "package.json" ]; then
    npm install
fi

for dir in camera-manager event-engine recorder local-api orchestrator ota local-ui; do
    echo "Checking directory: $dir"
    if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then
        echo "Processing $dir..."
        cd $dir
        echo "Installing/Updating modules for $dir..."
        echo "Installing/Updating modules for $dir..."
        # Remove --force to allow caching. Only installs if package.json changed.
        npm install
        if [ "$dir" == "local-ui" ]; then
            echo "Building Local UI (Fresh Build)..."
            if [ -d "build" ]; then
                echo "Removing existing build folder..."
                rm -rf build
            else
                echo "No build folder found (Clean start)."
            fi
            
            npm run build
            if [ $? -ne 0 ]; then
                echo "ERROR: UI BUILD FAILED"
                exit 1
            fi
            echo "UI Build Success."
        fi
        cd ..
    else
        echo "Skipping $dir (Not found or no package.json)"
    fi
done

# 9. Install Python AI modules
echo "[DSS] Skipping Python dependencies..."
if [ -d "ai-engine" ]; then
    cd ai-engine
    if [ -f "requirements.txt" ]; then
        echo "[DSS] Installing AI Python dependencies..."
        pip3 install -r requirements.txt
    fi
    cd ..
fi

# 10. Install Systemd Service
echo "[DSS] Installing Systemd Service..."
if [ -f "dss-edge.service" ]; then
    cp dss-edge.service /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable dss-edge
    systemctl start dss-edge
    echo "[DSS] Service started."
    echo "[DSS] Service file not found."
fi

if [ -f "dss-go2rtc.service" ]; then
    echo "[DSS] Installing Go2RTC Service..."
    cp dss-go2rtc.service /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable dss-go2rtc
    systemctl start dss-go2rtc
    echo "[DSS] Go2RTC Service started."
fi

echo "==============================================="
echo " INSTALL COMPLETE!"
echo " Check status: systemctl status dss-edge"
echo "==============================================="
