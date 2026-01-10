#!/bin/bash

# DSS SmartGuard VPN Installer (Tailscale)
# Usage: ./vpnInstaller.sh <auth-key>

AUTH_KEY=$1

if [ -z "$AUTH_KEY" ]; then
  echo "[VPN] Error: Auth Key required."
  echo "Usage: $0 <tskey-auth-xxxx>"
  exit 1
fi

echo "[VPN] Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh | sh

echo "[VPN] Authenticating and starting..."
tailscale up --authkey=$AUTH_KEY --hostname=DSS_EDGE_$(hostname) --reset

echo "[VPN] Setup complete. Status:"
tailscale ip -4
