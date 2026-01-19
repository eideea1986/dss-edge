/**
 * EXEC-30: Global Service Process Registry Manager
 * 
 * GOLDEN RULE: Registry is law. Code obeys.
 * 
 * This module enforces that NO process can be started, monitored, or validated
 * unless it is explicitly declared in the service-registry.json.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REGISTRY_PATH = path.join(__dirname, '../config/services.processes.json');

class ServiceRegistry {
    constructor() {
        this.registry = null;
        this.loadRegistry();
    }

    /**
     * Load and validate registry
     */
    loadRegistry() {
        try {
            const rawData = fs.readFileSync(REGISTRY_PATH, 'utf8');
            this.registry = JSON.parse(rawData);

            if (!this.registry || !this.registry.services) {
                throw new Error('Invalid registry structure');
            }

            console.log(`[Registry] Loaded ${this.getServiceCount()} service definitions`);

            if (this.registry.enforcement.strictMode) {
                console.log('[Registry] STRICT MODE ENABLED - Undeclared processes will be BLOCKED');
            }

        } catch (error) {
            console.error('[Registry] CRITICAL: Failed to load service registry:', error.message);
            if (this.registry?.enforcement.failOnMissing) {
                process.exit(1);
            }
        }
    }

    /**
     * Get total service count
     */
    getServiceCount() {
        let count = 0;
        Object.keys(this.registry.services).forEach(category => {
            count += Object.keys(this.registry.services[category]).length;
        });
        return count;
    }

    /**
     * Get service definition by name
     * @param {string} serviceName - Service name
     * @returns {object|null} Service definition or null
     */
    getService(serviceName) {
        for (const category in this.registry.services) {
            const services = this.registry.services[category];
            if (services[serviceName]) {
                return {
                    ...services[serviceName],
                    category
                };
            }
        }
        return null;
    }

    /**
     * ENFORCEMENT: Check if service is allowed to execute
     * @param {string} serviceName - Service name
     * @returns {boolean} True if allowed
     */
    isAllowed(serviceName) {
        const service = this.getService(serviceName);

        if (!service) {
            const errorMsg = `[Registry] CRITICAL: Service "${serviceName}" is NOT declared in registry`;
            console.error(errorMsg);

            if (this.registry.enforcement.strictMode && !this.registry.enforcement.allowUndeclared) {
                throw new Error(`EXECUTION BLOCKED: ${errorMsg}`);
            }
            return false;
        }

        return true;
    }

    /**
     * SAFE SPAWN: Spawn process ONLY if declared in registry
     * @param {string} serviceName - Service name
     * @param {object} options - Custom spawn options (optional)
     * @returns {ChildProcess} Spawned process
     */
    safeSpawn(serviceName, options = {}) {
        // STEP 1: Registry check
        const service = this.getService(serviceName);
        if (!service) {
            const errorMsg = `[Registry] BLOCKED: Cannot spawn undeclared service "${serviceName}"`;
            console.error(errorMsg);

            if (this.registry.enforcement.failOnMissing) {
                throw new Error(errorMsg);
            }
            return null;
        }

        // STEP 2: Build arguments
        const args = options.args || service.args || [];

        // Replace variables in args template
        const processedArgs = args.map(arg => {
            if (typeof arg === 'string' && arg.includes('${')) {
                // Replace ${VAR} with options.vars.VAR
                return arg.replace(/\$\{(\w+)\}/g, (match, varName) => {
                    return options.vars?.[varName] || match;
                });
            }
            return arg;
        });

        // STEP 3: Build spawn options
        const spawnOptions = {
            cwd: options.cwd || service.workingDir || process.cwd(),
            stdio: options.stdio || 'inherit',
            env: {
                ...process.env,
                ...options.env
            },
            ...options // Pass through other options (detached, shell, etc.)
        };

        // STEP 4: Execute
        console.log(`[Registry] Spawning ${serviceName}: ${service.binary} ${processedArgs.join(' ')}`);

        try {
            const proc = spawn(service.binary, processedArgs, spawnOptions);

            // Attach metadata
            proc.serviceName = serviceName;
            proc.serviceDefinition = service;

            // Lifecycle handling
            if (service.lifecycle) {
                if (service.lifecycle.maxLifetime && service.lifecycle.maxLifetime !== 'unlimited') {
                    setTimeout(() => {
                        console.log(`[Registry] Lifetime expired for ${serviceName}, terminating...`);
                        this.terminate(proc, service.lifecycle.terminationPolicy);
                    }, service.lifecycle.maxLifetime);
                }
            }

            proc.on('exit', (code, signal) => {
                console.log(`[Registry] ${serviceName} exited with code ${code}, signal ${signal}`);
            });

            return proc;

        } catch (error) {
            console.error(`[Registry] Failed to spawn ${serviceName}:`, error.message);
            throw error;
        }
    }

    /**
     * Terminate process according to policy
     */
    terminate(proc, policy = 'graceful') {
        if (!proc || proc.killed) return;

        switch (policy) {
            case 'graceful':
                proc.kill('SIGTERM');
                setTimeout(() => {
                    if (!proc.killed) {
                        console.log(`[Registry] Graceful termination failed, forcing...`);
                        proc.kill('SIGKILL');
                    }
                }, 5000);
                break;
            case 'force':
                proc.kill('SIGKILL');
                break;
            default:
                proc.kill('SIGTERM');
        }
    }

    /**
     * Get all services by role
     * @param {string} role - Service role
     * @returns {array} Array of service definitions
     */
    getServicesByRole(role) {
        const results = [];

        for (const category in this.registry.services) {
            const services = this.registry.services[category];
            for (const name in services) {
                if (services[name].role === role) {
                    results.push({
                        name,
                        ...services[name],
                        category
                    });
                }
            }
        }

        return results;
    }

    /**
     * Get all critical services
     * @returns {array} Array of critical service names
     */
    getCriticalServices() {
        const results = [];

        for (const category in this.registry.services) {
            const services = this.registry.services[category];
            for (const name in services) {
                if (services[name].criticality === 'critical') {
                    results.push(name);
                }
            }
        }

        return results;
    }

    /**
     * Validate service health according to registry definition
     * @param {string} serviceName - Service name
     * @param {object} context - Context object (redis client, etc.)
     * @returns {Promise<object>} Health status
     */
    async validateHealth(serviceName, context = {}) {
        const service = this.getService(serviceName);
        if (!service || !service.healthCheck) {
            return { status: 'UNKNOWN', reason: 'No health check defined' };
        }

        const check = service.healthCheck;

        try {
            switch (check.type) {
                case 'redis':
                    if (!context.redis) {
                        return { status: 'FAIL', reason: 'Redis client not provided' };
                    }
                    const value = await context.redis.get(check.key);
                    if (!value) {
                        return { status: 'FAIL', reason: `Key ${check.key} not found` };
                    }
                    const age = Date.now() - parseInt(value);
                    if (age > check.maxAge) {
                        return { status: 'FAIL', reason: `Stale (${age}ms > ${check.maxAge}ms)` };
                    }
                    return { status: 'OK', age };

                case 'file':
                    if (!fs.existsSync(check.path)) {
                        return { status: 'FAIL', reason: `File ${check.path} not found` };
                    }
                    const stat = fs.statSync(check.path);
                    const fileAge = Date.now() - stat.mtimeMs;
                    if (fileAge > check.maxAge) {
                        return { status: 'FAIL', reason: `File stale (${fileAge}ms)` };
                    }
                    return { status: 'OK', age: fileAge };

                case 'process':
                    if (!fs.existsSync(check.pidFile)) {
                        return { status: 'FAIL', reason: 'PID file not found' };
                    }
                    const pid = parseInt(fs.readFileSync(check.pidFile, 'utf8'));
                    try {
                        process.kill(pid, 0);
                        return { status: 'OK', pid };
                    } catch (e) {
                        return { status: 'FAIL', reason: 'Process not running' };
                    }

                case 'http':
                    // Would require http client - simplified here
                    return { status: 'UNKNOWN', reason: 'HTTP health check not implemented in this context' };

                default:
                    return { status: 'UNKNOWN', reason: `Unknown check type: ${check.type}` };
            }

        } catch (error) {
            return { status: 'ERROR', reason: error.message };
        }
    }

    /**
     * Export registry summary for UI/API
     */
    exportSummary() {
        return {
            version: this.registry.version,
            lastUpdated: this.registry.lastUpdated,
            totalServices: this.getServiceCount(),
            criticalServices: this.getCriticalServices().length,
            enforcement: this.registry.enforcement,
            categories: Object.keys(this.registry.services).reduce((acc, cat) => {
                acc[cat] = Object.keys(this.registry.services[cat]).length;
                return acc;
            }, {})
        };
    }
}

// Singleton instance
let registryInstance = null;

function getRegistry() {
    if (!registryInstance) {
        registryInstance = new ServiceRegistry();
    }
    return registryInstance;
}

module.exports = {
    ServiceRegistry,
    getRegistry
};
