# 🔐 EXEC-31: Arming Grid Zone Visibility Truth

**Status**: ✅ BACKEND COMPLETE / 🟡 UI IMPLEMENTATION PENDING  
**Date**: 2026-01-18  
**Priority**: MANDATORY - REQUIRED FOR SAFE OPERATION  

---

## 🎯 OBJECTIVE

Ensure that camera arming state is reflected correctly in the LIVE grid, and that detection zones are displayed **ONLY** when cameras are armed.

**NON-NEGOTIABLE LAW**: 
- Zones exist **ONLY** in armed state
- Grid **MUST** reflect real arming truth
- Cached or inferred arming state is **FORBIDDEN**

---

## ✅ BACKEND STATUS - COMPLETE

### **API Endpoints Available** (EXEC-31)

#### **1. GET /api/arming-state/state**
Returns global arming state + per-camera armed status

**Response Example**:
```json
{
  "armed": true,
  "state": "OK",
  "cameras": {
    "cam_00e5d3a3": {
      "armed": true,
      "zones": ["zone_1", "zone_3"]
    },
    "cam_e4a9af3b": {
      "armed": true,
      "zones": ["zone_2"]
    }
  },
  "zones": {
    "zone_1": ["cam_00e5d3a3", "cam_ff0486d4"],
    "zone_2": ["cam_e4a9af3b"]
  },
  "schedules": {},
  "timestamp": 1768740600000,
  "age": 432
}
```

**States**:
- `OK` - Fresh arming state from Redis
- `UNKNOWN` - Arming service unreachable
- `STALE` - State older than 15 seconds
- `FAIL` - State corrupted (armed field invalid)
- `ERROR` - Exception occurred

#### **2. GET /api/arming-state/camera/:cameraId**
Returns arming state for a single camera

**Response Example**:
```json
{
  "cameraId": "cam_00e5d3a3",
  "armed": true,
  "zones": ["zone_1", "zone_3"],
  "state": "OK",
  "timestamp": 1768740600000
}
```

#### **3. POST /api/arming-state/arm**
Arm the system

**Response**:
```json
{
  "success": true,
  "message": "System armed"
}
```

#### **4. POST /api/arming-state/disarm**
Disarm the system

**Response**:
```json
{
  "success": true,
  "message": "System disarmed"
}
```

---

## 🔧 UI IMPLEMENTATION REQUIREMENTS

### **STEP 1: Fetch Arming State**

```javascript
// In Live.js or LiveGrid component

useEffect(() => {
  // Fetch arming state on mount
  fetchArmingState();
  
  // Poll every 5 seconds for real-time updates
  const interval = setInterval(fetchArmingState, 5000);
  
  return () => clearInterval(interval);
}, []);

async function fetchArmingState() {
  try {
    const response = await fetch('/api/arming-state/state');
    const data = await response.json();
    
    if (data.state === 'OK') {
      setArmingState(data);
      updateCameraStates(data.cameras);
    } else {
      // FAIL-SAFE: Default to disarmed if state is not OK
      console.warn('Arming state not OK:', data.state, data.warning || data.error);
      setArmingState({ armed: false, cameras: {}, state: data.state });
    }
  } catch (error) {
    console.error('Failed to fetch arming state:', error);
    // FAIL-SAFE: Default to disarmed on error
    setArmingState({ armed: false, cameras: {}, state: 'ERROR' });
  }
}
```

### **STEP 2: Render Camera Tiles with Arming State**

```javascript
function CameraGridTile({ camera }) {
  const { armingState } = useContext(ArmingContext);
  
  // Determine if THIS camera is armed
  const cameraArmed = armingState.cameras[camera.id]?.armed || false;
  const cameraZones = armingState.cameras[camera.id]?.zones || [];
  
  return (
    <div className={`camera-tile ${cameraArmed ? 'armed' : 'disarmed'}`}>
      {/* Arming indicator badge */}
      <div className={`arming-badge ${cameraArmed ? 'badge-armed' : 'badge-disarmed'}`}>
        {cameraArmed ? '🔒 ARMED' : '🔓 DISARMED'}
      </div>
      
      {/* Video stream */}
      <video src={camera.streamUrl} autoPlay />
      
      {/* CRITICAL: Zones ONLY if armed */}
      {cameraArmed && (
        <div className="detection-zones">
          {cameraZones.map(zoneId => (
            <div key={zoneId} className="zone" data-zone={zoneId}>
              Zone {zoneId}
            </div>
          ))}
        </div>
      )}
      
      {/* Camera info */}
      <div className="camera-info">
        <span>{camera.name}</span>
        {cameraArmed && <span className="zone-count">{cameraZones.length} zones active</span>}
      </div>
    </div>
  );
}
```

### **STEP 3: Zone Visibility Rules (CRITICAL)**

```javascript
/**
 * EXEC-31: Zone Visibility Ruleset
 * 
 * Zones are rendered ONLY IF:
 * 1. Global system is armed (armingState.armed === true)
 * 2. Camera has zones assigned (cameraZones.length > 0)
 * 3. Arming state is fresh (state === 'OK')
 * 4. NOT in playback mode
 */

function shouldRenderZones(camera, armingState, mode) {
  // Rule 1: NOT in playback
  if (mode === 'playback') return false;
  
  // Rule 2: Arming state must be OK
  if (armingState.state !== 'OK') return false;
  
  // Rule 3: System must be armed
  if (!armingState.armed) return false;
  
  // Rule 4: Camera must have zones
  const cameraData = armingState.cameras[camera.id];
  if (!cameraData || !cameraData.armed) return false;
  if (!cameraData.zones || cameraData.zones.length === 0) return false;
  
  return true;
}

// Usage:
{shouldRenderZones(camera, armingState, 'live') && (
  <DetectionZones zones={armingState.cameras[camera.id].zones} />
)}
```

### **STEP 4: Real-Time State Transition**

```javascript
/**
 * When arming state changes, UI must update IMMEDIATELY
 * NO page reload allowed
 */

function handleArmingChange(newArmingState) {
  // Update state
  setArmingState(newArmingState);
  
  // Force re-render of affected cameras
  cameras.forEach(camera => {
    const wasArmed = previousState.cameras[camera.id]?.armed || false;
    const isArmed = newArmingState.cameras[camera.id]?.armed || false;
    
    if (wasArmed !== isArmed) {
      console.log(`Camera ${camera.id} arming changed: ${wasArmed} → ${isArmed}`);
      
      // Trigger animation
      animateCameraTile(camera.id, isArmed ? 'arm' : 'disarm');
      
      // Update zones immediately
      if (!isArmed) {
        hideZones(camera.id);
      } else {
        showZones(camera.id, newArmingState.cameras[camera.id].zones);
      }
    }
  });
}
```

### **STEP 5: Failure Safety**

```javascript
/**
 * EXEC-31 FAIL-SAFE POLICY
 * 
 * If arming service is unreachable or state is invalid:
 * - Display ALL cameras as DISARMED
 * - Hide ALL zones
 * - Show warning banner
 */

function renderFailSafeUI() {
  const { armingState } = useContext(ArmingContext);
  
  if (armingState.state !== 'OK') {
    return (
      <div className="warning-banner warning-critical">
        <strong>⚠️ Arming System {armingState.state}</strong>
        <p>
          {armingState.state === 'UNKNOWN' && 'Arming service unreachable. All cameras shown as DISARMED.'}
          {armingState.state === 'STALE' && 'Arming state is stale. System may not be armed correctly.'}
          {armingState.state === 'FAIL' && 'Arming state corrupted. Contact support.'}
          {armingState.state === 'ERROR' && 'Failed to retrieve arming state.'}
        </p>
      </div>
    );
  }
  
  return null;
}
```

---

## 🎨 RECOMMENDED CSS

```css
/* Camera tile arming states */
.camera-tile {
  position: relative;
  border: 2px solid transparent;
  transition: all 0.3s ease;
}

.camera-tile.armed {
  border-color: #e74c3c; /* Red border when armed */
  box-shadow: 0 0 10px rgba(231, 76, 60, 0.5);
}

.camera-tile.disarmed {
  border-color: #95a5a6; /* Gray border when disarmed */
  opacity: 0.8;
}

/* Arming badge */
.arming-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 5px 10px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 12px;
  z-index: 10;
}

.badge-armed {
  background-color: #e74c3c;
  color: white;
  animation: pulse-armed 2s infinite;
}

.badge-disarmed {
  background-color: #95a5a6;
  color: white;
}

@keyframes pulse-armed {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Detection zones (only visible when armed) */
.detection-zones {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
}

.zone {
  position: absolute;
  border: 2px solid #f39c12;
  background-color: rgba(243, 156, 18, 0.2);
  transition: opacity 0.3s ease;
}

/* Warning banner */
.warning-banner {
  padding: 15px;
  margin: 10px 0;
  border-radius: 4px;
  background-color: #f39c12;
  color: white;
  text-align: center;
}

.warning-critical {
  background-color: #e74c3c;
}
```

---

## 🧪 TESTING CHECKLIST

### **Test Case 1: Armed State**
- [ ] System armed → All cameras in grid show "ARMED" badge
- [ ] Cameras with zones show zone overlays
- [ ] Cameras without zones show badge but NO overlays

### **Test Case 2: Disarmed State**
- [ ] System disarmed → All "ARMED" badges change to "DISARMED"
- [ ] ALL zone overlays disappear immediately
- [ ] Camera opacity reduced (disarmed visual state)

### **Test Case 3: Real-Time Transition**
- [ ] Arm system → Grid updates within 5 seconds (poll interval)
- [ ] No page reload occurs
- [ ] Smooth animation for badge + zone appearance

### **Test Case 4: Failure Safety**
- [ ] Stop arming service → Warning banner appears
- [ ] ALL cameras show as DISARMED
- [ ] ALL zones hidden
- [ ] System usable but safe

### **Test Case 5: Per-Camera Arming**
- [ ] Camera A has zones → shows zones when armed
- [ ] Camera B has NO zones → shows badge but NO zones
- [ ] Both armed → both show badges correctly

### **Test Case 6: Playback Mode**
- [ ] Switch to playback → zones NEVER shown
- [ ] Even if system is armed
- [ ] Arming badges hidden in playback

---

## 📊 SUCCESS CRITERIA

**EXEC-31 is successful when**:
- ✅ Arming state fetched from `/api/arming-state/state`
- ✅ Grid reflects armed/disarmed state per-camera
- ✅ Zones visible ONLY when camera is armed
- ✅ Zones hidden immediately when disarmed
- ✅ Real-time updates (poll every 5s)
- ✅ Fail-safe: defaults to disarmed if service unreachable
- ✅ No cached or stale arming state used

---

## 🚨 COMMON MISTAKES TO AVOID

### **❌ WRONG: Using Cached State**
```javascript
// BAD: State from local storage
const armingState = JSON.parse(localStorage.getItem('armingState'));
```

### **✅ CORRECT: Using Live API**
```javascript
// GOOD: Live state from API
const response = await fetch('/api/arming-state/state');
const armingState = await response.json();
```

### **❌ WRONG: Inverting Logic**
```javascript
// BAD: Shows zones when DISARMED
{!cameraArmed && <DetectionZones />}
```

### **✅ CORRECT: Zones Only When Armed**
```javascript
// GOOD: Shows zones when ARMED
{cameraArmed && <DetectionZones />}
```

### **❌ WRONG: No Failure Handling**
```javascript
// BAD: No check for state validity
const armed = armingState.armed; // Could be stale/corrupted
```

### **✅ CORRECT: Validate State**
```javascript
// GOOD: Check state before trusting data
const armed = armingState.state === 'OK' && armingState.armed;
```

---

## 🔗 RELATED DOCUMENTATION

- `EXEC-22-IMPLACABLE-MODE.md` - Arming service implementation
- `EXEC-30-GLOBAL-REGISTRY.md` - Service registry
- `arming_service.js` - Arming service source

---

## 🏁 DEPLOYMENT STATUS

**Backend**: ✅ COMPLETE  
**API**: ✅ READY (`/api/arming-state/*`)  
**UI**: 🟡 PENDING (implementation required)  

**Next Steps**:
1. Integrate API into Live Grid component
2. Implement zone visibility logic
3. Add arming badge to camera tiles
4. Test all scenarios
5. Deploy and verify

---

**END OF EXEC-31 DOCUMENTATION**

**"If a camera is not armed, it must look inactive and harmless."** 🔓
