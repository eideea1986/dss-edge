/**
 * EXEC-30 Quick Reference: Service Registry Usage
 * 
 * Copy-paste examples for common tasks
 */

const { getRegistry } = require('../lib/ServiceRegistry');

// ============================================================================
// BASIC USAGE
// ============================================================================

// Get registry instance (singleton)
const registry = getRegistry();

// ============================================================================
// SPAWN PROCESSES (SAFE)
// ============================================================================

// Example 1: Spawn internal service
const recorderProc = registry.safeSpawn('recorder_v2');

// Example 2: Spawn with custom environment
const indexerProc = registry.safeSpawn('storage_indexer', {
    env: { DEBUG: 'true' }
});

// Example 3: Spawn FFmpeg with variables
const ffmpegProc = registry.safeSpawn('ffmpeg_recorder', {
    vars: {
        RTSP_URL: 'rtsp://admin:password@192.168.1.100:554/stream',
        OUTPUT_PATH: '/opt/dss-edge/storage/cam_abc123/%Y-%m-%d/%H-%M-%S.mp4'
    }
});

// Example 4: Spawn with custom stdio
const exportProc = registry.safeSpawn('ffmpeg_export', {
    vars: {
        INPUT_PATH: '/opt/dss-edge/storage/cam_123/2026/01/18/14/30-00.mp4',
        OUTPUT_PATH: '/tmp/export_123.mp4'
    },
    stdio: ['ignore', 'pipe', 'pipe']
});

exportProc.stdout.on('data', (data) => {
    console.log(`Export progress: ${data}`);
});

// ============================================================================
// SERVICE LOOKUP
// ============================================================================

// Get service definition
const recorderDef = registry.getService('recorder_v2');
console.log(recorderDef);
// {
//   name: 'recorder_v2',
//   role: 'video_recorder',
//   type: 'internal',
//   binary: '/usr/bin/node',
//   args: ['modules/record/recorder_v2.js'],
//   workingDir: '/opt/dss-edge',
//   criticality: 'critical',
//   ...
// }

// Get services by role
const allRecorders = registry.getServicesByRole('video_recorder');
const allVPN = registry.getServicesByRole('vpn_tunnel');

// Get all critical services
const criticalServices = registry.getCriticalServices();
console.log('Critical:', criticalServices);
// ['dss-supervisor', 'dss-api', 'orchestrator', 'recorder_v2', ...]

// ============================================================================
// HEALTH VALIDATION
// ============================================================================

// Example: Validate service health (requires Redis client)
const redis = require('./redisClient'); // Your Redis client

async function checkHealth() {
    const recorderHealth = await registry.validateHealth('recorder_v2', { redis });
    console.log('Recorder health:', recorderHealth);
    // { status: 'OK', age: 4523 }

    const armingHealth = await registry.validateHealth('arming_service', { redis });
    console.log('Arming health:', armingHealth);
    // { status: 'OK', age: 1234 }
}

// ============================================================================
// REGISTRY INFORMATION
// ============================================================================

// Get registry summary
const summary = registry.exportSummary();
console.log(summary);
// {
//   version: '1.0.0',
//   totalServices: 14,
//   criticalServices: 9,
//   enforcement: { strictMode: true, ... },
//   categories: { systemd: 3, internal: 5, external: 3, child_processes: 3 }
// }

// ============================================================================
// ERROR HANDLING
// ============================================================================

try {
    // This will THROW if service not in registry (strict mode)
    const proc = registry.safeSpawn('unknown_service');
} catch (error) {
    console.error('Spawn failed:', error.message);
    // "EXECUTION BLOCKED: Service 'unknown_service' is NOT declared in registry"
}

// ============================================================================
// LIFECYCLE MANAGEMENT
// ============================================================================

// Spawn with automatic termination
const tempProc = registry.safeSpawn('ffmpeg_export', {
    vars: { INPUT_PATH: '...', OUTPUT_PATH: '...' }
});
// Child processes with maxLifetime will be auto-terminated
// ffmpeg_export has maxLifetime: 300000 (5 minutes)

// Manual termination (graceful)
registry.terminate(tempProc, 'graceful');
// Sends SIGTERM, waits 5s, then SIGKILL if needed

// Manual termination (force)
registry.terminate(tempProc, 'force');
// Sends SIGKILL immediately

// ============================================================================
// INTEGRATION EXAMPLE: Orchestrator
// ============================================================================

class ServiceOrchestrator {
    constructor() {
        this.registry = getRegistry();
        this.processes = new Map();
    }

    startService(serviceName) {
        try {
            console.log(`Starting ${serviceName}...`);
            const proc = this.registry.safeSpawn(serviceName);

            proc.on('exit', (code) => {
                console.log(`${serviceName} exited with code ${code}`);
                this.processes.delete(serviceName);

                // Auto-restart critical services
                const def = this.registry.getService(serviceName);
                if (def.criticality === 'critical') {
                    console.log(`Restarting critical service ${serviceName}...`);
                    setTimeout(() => this.startService(serviceName), 5000);
                }
            });

            this.processes.set(serviceName, proc);
            return proc;

        } catch (error) {
            console.error(`Failed to start ${serviceName}:`, error.message);
            return null;
        }
    }

    stopService(serviceName) {
        const proc = this.processes.get(serviceName);
        if (proc) {
            const def = this.registry.getService(serviceName);
            const policy = def.lifecycle?.terminationPolicy || 'graceful';
            this.registry.terminate(proc, policy);
        }
    }

    async healthCheckAll() {
        const redis = require('./redisClient');
        const results = {};

        for (const [name, proc] of this.processes) {
            results[name] = await this.registry.validateHealth(name, { redis });
        }

        return results;
    }
}

// Usage:
const orch = new ServiceOrchestrator();
orch.startService('recorder_v2');
orch.startService('arming_service');

const health = await orch.healthCheckAll();
console.log(health);

// ============================================================================
// VALIDATION BEFORE DEPLOYMENT
// ============================================================================

// Run this before deploying:
// $ node scripts/validate-registry.js
//
// ✅ Registry validation PASSED
//    Ready for deployment

module.exports = {
    // Re-export for convenience
    getRegistry
};
