#!/bin/bash
STORAGE_DIR="/opt/dss-edge/recorder/storage"
RETENTION_DAYS=7

# Delete empty directories
find "$STORAGE_DIR" -mindepth 2 -type d -empty -delete

# Delete segment directories older than retention days
find "$STORAGE_DIR" -mindepth 2 -maxdepth 2 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} +

# Log cleanup (optional)
echo "[$(date)] Cleanup ran keeping $RETENTION_DAYS days" >> /opt/dss-edge/recorder/cleanup.log
