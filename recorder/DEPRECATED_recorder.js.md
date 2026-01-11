# ❌ DEPRECATED - DO NOT USE IN PRODUCTION

This file is kept for **development and testing purposes ONLY**.

## Why this file exists
Historical implementation of recorder in Node.js before C++ migration.

## Production status
**🔴 NOT FOR CLIENT DEPLOYMENT**

The production recorder is:
- **Binary**: `/usr/bin/recorder` (C++)
- **Source**: `recorder/Decoder.cpp`, `recorder/Segmenter.cpp`
- **Management**: Spawned by `edgeOrchestrator.js`

## If you see this file on a production system
This is a deployment error. Remove immediately.

## Alternative
Use the C++ recorder binary managed by the supervisor/orchestrator.
