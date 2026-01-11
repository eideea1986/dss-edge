#!/bin/bash
STORAGE_DIR="/opt/dss-edge/storage"
RETENTION_DAYS=7

# Delete segment files older than retention days
find "$STORAGE_DIR" -name "*.ts" -mtime +$RETENTION_DAYS -delete
find "$STORAGE_DIR" -name "*.mp4" -mtime +$RETENTION_DAYS -delete

# Delete empty directories
find "$STORAGE_DIR" -mindepth 1 -type d -empty -delete

# Log cleanup (optional)
echo "[$(date)] Cleanup ran keeping $RETENTION_DAYS days" >> /opt/dss-edge/storage/cleanup.log
