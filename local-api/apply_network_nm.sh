#!/bin/bash
# Usage: ./apply_network_nm.sh <IFACE> <MODE> [IP/CIDR] [GATEWAY] [DNS1] [DNS2]

IFACE=$1
MODE=$2
IP_CIDR=$3
GATEWAY=$4
DNS1=$5
DNS2=$6

# 1. Find the Connection UUID for this Interface
# Uses nmcli to find the active connection for the device
UUID=$(nmcli -t -f UUID,DEVICE con show --active | grep ":$IFACE$" | cut -d: -f1 | head -n1)

# If no active connection, try finding any connection bound to this interface
if [ -z "$UUID" ]; then
    UUID=$(nmcli -t -f UUID,DEVICE con show | grep ":$IFACE$" | cut -d: -f1 | head -n1)
fi

if [ -z "$UUID" ]; then
    echo "Error: No NetworkManager connection found for interface $IFACE"
    exit 1
fi

echo "Configuring Connection '$UUID' on interface '$IFACE' to mode '$MODE'..."

if [ "$MODE" == "dhcp" ]; then
    # Set to Automatic (DHCP)
    # Clearing static assignments
    nmcli con mod "$UUID" \
        ipv4.method auto \
        ipv4.addresses "" \
        ipv4.gateway "" \
        ipv4.dns ""

elif [ "$MODE" == "manual" ]; then
    # Set to Manual (Static)
    DNS_STR="$DNS1"
    if [ ! -z "$DNS2" ]; then
        DNS_STR="$DNS1 $DNS2"
    fi

    # Apply Configuration
    # We must ensure ignore-auto-dns is yes if manual? Usually automatic with manual method.
    nmcli con mod "$UUID" \
        ipv4.method manual \
        ipv4.addresses "$IP_CIDR" \
        ipv4.gateway "$GATEWAY" \
        ipv4.dns "$DNS_STR"
fi

# Apply the changes by reactivating the connection
nmcli con up "$UUID"
exit $?
