#!/bin/bash
# deploy_patch.sh
echo "[Deploy] Stopping services..."
systemctl stop dss-edge

echo "[Deploy] Backing up existing config (just in case)..."
cp /opt/dss-edge/config/cameras.json /opt/dss-edge/config/cameras.json.bak 2>/dev/null

echo "[Deploy] Extracting patch to /opt/dss-edge..."
# Assumes dss-edge-patch.tar.gz is in the same directory
tar -xzf dss-edge-patch.tar.gz -C /opt/dss-edge/

echo "[Deploy] Installing dependencies for local-api..."
cd /opt/dss-edge/local-api
npm install --production

echo "[Deploy] Installing dependencies for camera-manager..."
cd /opt/dss-edge/camera-manager
npm install --production

echo "[Deploy] Starting services..."
systemctl start dss-edge
systemctl status dss-edge --no-pager

echo "[Deploy] Done. Check logs with: journalctl -u dss-edge -f"
