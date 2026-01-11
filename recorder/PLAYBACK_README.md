# DSS-Edge Recorder - Cleanup Old Playback Versions

## Deprecated Files (DO NOT USE IN PRODUCTION)
The following files are kept for development/testing ONLY:
- PlaybackEngine.cpp (V1 - deprecated)
- PlaybackEngineV2.cpp (V2 - deprecated)  
- PlaybackEngineV3.cpp (V3 - deprecated)

## Production Playback
**USE ONLY:** `playback_server.cpp`

This is the enterprise-grade playback server with:
- Fixed RTSP endpoint (rtsp://127.0.0.1:8554/playback)
- SQLite index reading
- FFmpeg streaming
- Speed control

## Node.js Role
Node.js should ONLY:
- Spawn playback_server process
- Kill playback_server process  
- Read playback status

Node.js should NOT:
- ❌ Decode video
- ❌ Read segments
- ❌ Handle FFmpeg directly
