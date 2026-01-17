# Incident Report: 100% Disk Usage & Recorder Failure

## 1. Issue Summary
*   **Symptoms:** System unstable, UI unresponsive, "Recorder ERR" in logs.
*   **Root Cause 1 (Disk):** The root partition `/` was 100% full (233GB used).
    *   The `RetentionManager.js` and `cleanup.sh` scripts were configured to clean `/opt/dss-edge/recorder/segments`, which contained only 14GB of data.
    *   The *actual* active recorder was writing to `/opt/dss-edge/storage` (190GB), which had **NO** cleanup active.
*   **Root Cause 2 (Service):** A "ghost" PM2 process (PID 1370264) was running in the background, holding port 8080 and conflicting with the official `systemd` service, causing flapping and high load.

## 2. Actions Taken
1.  **Storage Path Correction:**
    *   Updated `camera-manager/src/RetentionManager.js` to target `/opt/dss-edge/storage`.
    *   Refined the cleanup logic to robustly find and delete oldest `.ts/.mp4` files across all camera subdirectories.
    *   Updated `recorder/cleanup.sh` to match the correct path.
2.  **Lifecycle Update:**
    *   Added `retentionManager.startCleanupLoop()` to `lifecycle.js` to ensure cleanup runs automatically on system start.
3.  **Emergency Cleanup:**
    *   Manually deleted recordings older than 7 days from `/opt/dss-edge/storage`.
    *   **Freed ~46GB** (Disk usage dropped to 85%).
4.  **Process Cleanup:**
    *   Identified and killed the zombie PM2 daemon.
    *   Restarted the `dss-edge` systemd service.

## 3. Current Status
*   **Service:** `dss-edge` is **Active (Running)**.
*   **Recording:** Functioning correctly. Verification showed new `.ts` segments being created in `/opt/dss-edge/storage` immediately after restart.
*   **Retention:** The patched `RetentionManager` is now active and monitoring the correct directory.
*   **Disk Usage:** 85% (Healthy buffer).

## 4. Recommendations
*   Monitor disk usage over the next 24-48 hours to ensure `RetentionManager` maintains the balance.
*   Avoid using PM2 manually alongside systemd to prevent future conflicts.
