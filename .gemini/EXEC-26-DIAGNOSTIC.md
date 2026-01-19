## 🔴 DIAGNOSTIC FINAL - EXEC-26

### PROBLEMA IDENTIFICATĂ

**Timeline apare** (✅ EXEC-23 funcționează - folosește FS direct)  
**Video NU pornește** (🔴 EXEC-25 - HLS playlist GOL)

### ROOT CAUSE

`/api/playback/playlist/:camId.m3u8` returnează playlist **GOL**:
```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:3
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-ENDLIST
```

**CAUZĂ**: `selectSegments()` din `SegmentSelector.js` nu găsește segmente.

**DOVEZI**:
- ✅ 8227 segmente în SQLite index
- ✅ Fișiere fizice există (`/opt/dss-edge/storage/cam_e4a9af3b/2026/01/18/05-13/`)
- ❌ `selectSegments(camId, startTime, duration)` returnează `[]`

### SOLUȚIE URGENTĂ

**Bypass SQLite index** - Folosește direct filesystem ca `/timeline-day`:

```javascript
// playbackController.js - getPlaylist()
// ÎNAINTE (folosește SQLite - BROKEN):
const segments = await selectSegments(camId, startTime, endTime - startTime);

// DUPĂ (folosește FS direct - WORKING):
const segments = await getSegmentsFromFS(camId, startTime, endTime);

async function getSegmentsFromFS(camId, startTs, endTs) {
    const day = new Date(startTs);
    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    
    // Reuse timeline-day logic (proven working)
    const timeline = await fetch(`http://127.0.0.1:8080/api/playback/timeline-day/${camId}/${dateStr}`).then(r => r.json());
    
    // Filter to requested interval
    return timeline.segments.filter(s => s.start_ts >= startTs && s.end_ts <= endTs);
}
```

### ACȚIUNE IMEDIATĂ

Voi modifica `playbackController.js` să folosească FS direct în loc de SQLite.
