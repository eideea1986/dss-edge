#!/bin/bash

# DSS Edge System Monitor Dashboard
# Real-time status of all critical services

clear
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         DSS SMART GUARD - System Monitor v2.0            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Function to check service health
check_service() {
    local port=$1
    local name=$2
    
    if timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/$port" 2>/dev/null; then
        echo "  ✓ $name (Port $port) - ONLINE"
        return 0
    else
        echo "  ✗ $name (Port $port) - OFFLINE"
        return 1
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " CRITICAL SERVICES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

critical=0
check_service 1984 "Go2RTC Video Engine      " || ((critical++))
check_service 8080 "Local API                " || ((critical++))
check_service 5003 "Recorder                 " || ((critical++))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " SUPPORTING SERVICES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_service 5002 "Camera Manager           "
check_service 8554 "Go2RTC RTSP Server       "

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " SYSTEM HEALTH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Orchestrator Status
if systemctl is-active --quiet dss-edge; then
    echo "  Orchestrator: ACTIVE"
else
    echo "  Orchestrator: STOPPED"
fi

# Disk Usage
df -h /opt/dss-edge/recorder/segments 2>/dev/null | awk 'NR==2 {print "  Storage:      " $3 " used / " $2 " total (" $5 " full)"}'

# Uptime
uptime_info=$(uptime -p 2>/dev/null || uptime | sed 's/.*up //' | sed 's/,.*//')
echo "  Uptime:       $uptime_info"

# CPU Load
cpu_load=$(uptime | awk -F'load average:' '{print $2}' | xargs)
echo "  CPU Load:     $cpu_load"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " RECENT EVENTS (Last 5 minutes)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

journalctl -u dss-edge --since "5 minutes ago" | grep -E "CRITICAL|ERROR|WARN|Starting|Restarting" | tail -n 5

echo ""
if [ $critical -eq 0 ]; then
    echo "  STATUS: ✓ ALL SYSTEMS OPERATIONAL"
else
    echo "  STATUS: ⚠ $critical CRITICAL SERVICE(S) DOWN"
fi
echo ""
