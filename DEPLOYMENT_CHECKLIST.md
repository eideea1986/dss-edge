# DSS-Edge v1.3.0 - Enterprise Deployment Checklist

## Pre-Deployment Validation ✅

### Code Quality
- [x] C++ Recorder compiled without warnings
- [x] C++ Supervisor compiled without warnings  
- [x] C++ Playback Server compiled without warnings
- [x] Node.js dependencies installed (production only)
- [x] UI built successfully (React)

### Architecture Compliance
- [x] Supervisor monitors orchestrator
- [x] Heartbeat file created (`/tmp/dss-recorder.hb`)
- [x] Anti-flapping implemented (3 restarts/60s)
- [x] Persistent logging (`/var/log/dss-supervisor.log`)
- [x] Node.js does NOT process video
- [x] Only ONE playback engine (`playback_server`)

### File Cleanup
- [x] `recorder.js` marked as deprecated
- [x] `recorder_remote.js` marked as deprecated
- [x] `PlaybackEngine.cpp` (V1) excluded from build
- [x] `PlaybackEngineV2.cpp` excluded from build
- [x] `PlaybackEngineV3.cpp` excluded from build
- [x] `.productionignore` created
- [x] `build-production-package.sh` created

---

## Deployment Steps 🚀

### 1. Build Production Package
```bash
cd /path/to/dss-edge
chmod +x build-production-package.sh
./build-production-package.sh
```

**Output**: `build-package/dss-edge-1.3.0-production.tar.gz`

### 2. Transfer to Target Server
```bash
scp build-package/dss-edge-1.3.0-production.tar.gz root@<server-ip>:/tmp/
```

### 3. Install on Target
```bash
ssh root@<server-ip>
cd /tmp
tar -xzf dss-edge-1.3.0-production.tar.gz
cd dss-edge-1.3.0-production
./install.sh
```

### 4. Verify Installation
```bash
# Check binaries
which dss-supervisor recorder playback_server

# Check service
systemctl status dss-supervisor

# Check logs
tail -f /var/log/dss-supervisor.log
```

### 5. Start System
```bash
systemctl start dss-supervisor
systemctl enable dss-supervisor
```

### 6. Verify Runtime
```bash
# Check supervisor is running
ps aux | grep dss-supervisor

# Check orchestrator spawned
ps aux | grep edgeOrchestrator

# Check heartbeat updates
watch -n 1 "stat /tmp/dss-recorder.hb"

# Check UI accessible
curl http://localhost:8080
```

---

## Post-Deployment Testing 🧪

### Crash Recovery Test
```bash
# 1. Kill orchestrator
kill -9 $(pgrep -f edgeOrchestrator)

# 2. Verify supervisor restarts it (within 5 seconds)
watch -n 1 "ps aux | grep edgeOrchestrator"

# 3. Check logs
grep "Orchestrator crashed" /var/log/dss-supervisor.log
grep "Orchestrator restarted" /var/log/dss-supervisor.log
```

### Freeze Detection Test
```bash
# 1. Stop heartbeat updates (simulate freeze)
touch -d "5 minutes ago" /tmp/dss-recorder.hb

# 2. Verify supervisor logs freeze detection
tail -f /var/log/dss-supervisor.log | grep "heartbeat timeout"
```

### Playback Test
```bash
# 1. Add a camera via UI
# 2. Wait for recording (check /opt/dss-edge/storage/cam_*/segments/)
# 3. Start playback via UI
# 4. Verify RTSP stream
ffplay rtsp://localhost:8554/playback
```

### Performance Test
```bash
# CPU should be ~1-2% per camera
top -b -n 1 | grep recorder

# Memory should be ~30MB per recorder
ps aux | grep recorder | awk '{sum+=$6} END {print sum/NR/1024 " MB"}'
```

---

## Production Monitoring 📊

### Daily Checks
```bash
# Service status
systemctl status dss-supervisor

# Disk usage (should not exceed 90%)
df -h /opt/dss-edge/storage

# Log size (rotate if > 1GB)
ls -lh /var/log/dss-supervisor.log
```

### Weekly Checks
```bash
# Restart count (should be low)
grep "Restarting orchestrator" /var/log/dss-supervisor.log | wc -l

# Freeze events (should be zero)
grep "freeze detected" /var/log/dss-supervisor.log | wc -l

# Disk cleanup (if needed)
find /opt/dss-edge/storage -name "*.ts" -mtime +30 -delete
```

---

## Rollback Procedure 🔄

### If Deployment Fails
```bash
# 1. Stop supervisor
systemctl stop dss-supervisor

# 2. Restore previous version
cd /opt/dss-edge-backup
./install.sh

# 3. Restart
systemctl start dss-supervisor
```

---

## Sign-Off ✍️

### Pre-Production
- [ ] All tests pass
- [ ] CPU usage < 10% per camera
- [ ] Crash recovery works
- [ ] Freeze detection works
- [ ] Playback works
- [ ] No deprecated files in package

### Production Ready
- [ ] Client approval
- [ ] Documentation reviewed
- [ ] Support trained
- [ ] Monitoring configured
- [ ] Backup plan tested

### Deployed
- [ ] Service running
- [ ] Monitoring active
- [ ] Client notified
- [ ] Support on standby

---

**Deployment Date**: _____________  
**Signed By**: _____________  
**Client**: _____________  
**Version**: 1.3.0  
**Status**: ✅ Enterprise Ready
