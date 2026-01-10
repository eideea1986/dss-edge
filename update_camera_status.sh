#!/bin/bash
# Auto-update camera status from Go2RTC every minute
cd /opt/dss-edge

# Get active streams
STREAMS=$(curl -s http://127.0.0.1:1984/api/streams | jq -r 'keys[]' 2>/dev/null)

if [ -z "$STREAMS" ]; then
    exit 0
fi

# Read cameras.json
CAMERAS=$(cat config/cameras.json)

# Update status
echo "$CAMERAS" | jq --arg streams "$STREAMS" '
  map(
    . as $cam |
    if ($streams | contains($cam.id)) then
      .status = "ONLINE"
    else
      .status = "OFFLINE"
    end
  )
' > config/cameras.json.tmp && mv config/cameras.json.tmp config/cameras.json

# Force backend reload via API endpoint
curl -s http://127.0.0.1:8080/reload-status > /dev/null

echo "[$(date)] Status updated + API reloaded"
