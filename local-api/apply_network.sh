#!/bin/bash

# apply_network.sh
# Usage: ./apply_network.sh <INTERFACE> <MODE> [IP/CIDR] [GATEWAY] [DNS1] [DNS2]
# MODE: dhcp | manual

IFACE=$1
MODE=$2
IP=$3
GATEWAY=$4
DNS1=$5
DNS2=$6

CONFIG_FILE="/etc/netplan/99-dss-edge.yaml"

if [ -z "$IFACE" ] || [ -z "$MODE" ]; then
    echo "Usage: $0 <INTERFACE> <MODE> [IP] [GATEWAY] [DNS]"
    exit 1
fi

echo "Generating Netplan config for $IFACE in $MODE mode..."

# Start creating YAML
cat <<EOF > /tmp/netplan_gen.yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    $IFACE:
EOF

if [ "$MODE" == "dhcp" ]; then
    cat <<EOF >> /tmp/netplan_gen.yaml
      dhcp4: true
EOF
else
    # Manual Mode
    cat <<EOF >> /tmp/netplan_gen.yaml
      dhcp4: no
      addresses:
        - $IP
      routes:
        - to: default
          via: $GATEWAY
      nameservers:
        addresses: [$DNS1, $DNS2]
EOF
fi

# Apply
echo "Backing up old config..."
# We don't want to overwrite system defaults entirely if we can avoid it, 
# but usually standard ubuntu server has 50-cloud-init.yaml.
# We write 99-dss-edge.yaml to override.

# Move generated file to /etc/netplan (Requires Root/Sudo)
# check if we are root
if [ "$EUID" -ne 0 ]; then
  echo "Please run with sudo or as root"
  exit 1
fi

mv /tmp/netplan_gen.yaml $CONFIG_FILE
chmod 600 $CONFIG_FILE

echo "Applying Netplan..."
netplan apply

echo "Network settings applied."
