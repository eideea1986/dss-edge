/**
 * ANTIGRAVITY :: MODULE CONTRACTS
 * 
 * JSON Schema Contracts + SemVer + Strict Boundary Enforcement
 * Enterprise Module Interface Validation
 */

const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONTRACT_CONFIG = {
    PROFILE: 'enterprise-nvr-final-structure',
    ENABLED: true,
    FORMAT: 'json-schema',
    VERSIONING: 'semver',
    ENFORCE_BOUNDARIES: 'strict',
    VALIDATE_ON_START: true,
    BREAK_ON_MISMATCH: true,
    AUTO_GENERATE: true,
    PERSIST: true,
    STRUCTURE_LOCKED: true,

    REDIS_PREFIX: 'contracts:',
    CONTRACTS_PATH: '/opt/dss-edge/config/contracts'
};

// ═══════════════════════════════════════════════════════════════════════════
// MODULE CONTRACTS DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

const MODULE_CONTRACTS = {
    // Recorder Module Contract
    recorder: {
        version: '1.0.0',
        name: 'Recorder Module',
        description: 'Handles video recording and storage',

        inputs: {
            cameras: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['id', 'enabled'],
                    properties: {
                        id: { type: 'string' },
                        enabled: { type: 'boolean' },
                        rtspMain: { type: 'string' },
                        rtspSub: { type: 'string' }
                    }
                }
            }
        },

        outputs: {
            functional_proof: {
                type: 'object',
                required: ['active_writers', 'total_cameras', 'suspended', 'timestamp', 'status'],
                properties: {
                    active_writers: { type: 'number', minimum: 0 },
                    total_cameras: { type: 'number', minimum: 0 },
                    suspended: { type: 'number', minimum: 0 },
                    timestamp: { type: 'number' },
                    status: { type: 'string', enum: ['OPERATIONAL', 'IDLE', 'DEGRADED'] }
                }
            },
            cam_status: {
                type: 'object',
                additionalProperties: {
                    type: 'string',
                    enum: ['RECORDING', 'FAIL_FAST_SUSPENDED', 'OFFLINE']
                }
            }
        },

        events: {
            emits: ['recorder:started', 'recorder:stopped', 'recorder:segment_created'],
            listens: ['state:retention:trigger', 'exec34:critical_fail']
        },

        healthProbe: {
            type: 'redis',
            key: 'recorder:functional_proof',
            maxAge: 10000
        },

        dependencies: ['decoder', 'storage']
    },

    // AI/Motion Module Contract
    ai: {
        version: '1.0.0',
        name: 'AI Motion Detection Module',
        description: 'Processes motion events with AI analysis',

        inputs: {
            armed_events: {
                type: 'object',
                required: ['cameraId', 'timestamp'],
                properties: {
                    cameraId: { type: 'string' },
                    timestamp: { type: 'number' },
                    zone: { type: 'string' }
                }
            }
        },

        outputs: {
            functional_proof: {
                type: 'object',
                required: ['status', 'activeCameras', 'eventsGenerated', 'eventsDropped', 'queueLength', 'timestamp'],
                properties: {
                    status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'DEGRADED', 'FAILED'] },
                    activeCameras: { type: 'array', items: { type: 'string' } },
                    eventsGenerated: { type: 'number' },
                    eventsDropped: { type: 'number' },
                    queueLength: { type: 'number' },
                    timestamp: { type: 'number' }
                }
            }
        },

        events: {
            emits: ['events:analyzed'],
            listens: ['events:armed', 'ARMING_STATE_CHANGED', 'exec34:critical_fail']
        },

        healthProbe: {
            type: 'redis',
            key: 'motion:functional_proof',
            maxAge: 15000
        },

        dependencies: ['recorder']
    },

    // Arming Module Contract
    arming: {
        version: '1.0.0',
        name: 'Arming Service Module',
        description: 'Manages system arming state',

        inputs: {
            arm_command: {
                type: 'object',
                required: ['action'],
                properties: {
                    action: { type: 'string', enum: ['arm', 'disarm'] },
                    cameras: { type: 'array', items: { type: 'string' } }
                }
            }
        },

        outputs: {
            state: {
                type: 'object',
                required: ['armed', 'timestamp'],
                properties: {
                    armed: { type: 'boolean' },
                    cameras: { type: 'object' },
                    timestamp: { type: 'number' }
                }
            }
        },

        events: {
            emits: ['ARMING_STATE_CHANGED'],
            listens: []
        },

        healthProbe: {
            type: 'redis',
            key: 'hb:arming',
            maxAge: 15000
        },

        dependencies: []
    },

    // Live Module Contract
    live: {
        version: '1.0.0',
        name: 'Live Streaming Module',
        description: 'Handles live video streaming',

        inputs: {
            stream_request: {
                type: 'object',
                required: ['cameraId'],
                properties: {
                    cameraId: { type: 'string' },
                    quality: { type: 'string', enum: ['hd', 'sd', 'sub'] }
                }
            }
        },

        outputs: {
            stream_url: {
                type: 'string',
                pattern: '^(rtsp|http|ws)://'
            }
        },

        events: {
            emits: ['live:stream_started', 'live:stream_stopped'],
            listens: []
        },

        healthProbe: {
            type: 'redis',
            key: 'hb:live',
            maxAge: 5000
        },

        dependencies: ['decoder']
    },

    // NVR State Module Contract
    nvr: {
        version: '1.0.0',
        name: 'Enterprise NVR State Module',
        description: 'Global NVR state management',

        outputs: {
            global_state: {
                type: 'object',
                required: ['services', 'timestamp'],
                properties: {
                    services: { type: 'object' },
                    timestamp: { type: 'number' }
                }
            },
            health: {
                type: 'object',
                required: ['recorder', 'ai', 'live', 'timestamp'],
                properties: {
                    recorder: { type: 'object' },
                    ai: { type: 'object' },
                    live: { type: 'object' },
                    timestamp: { type: 'number' }
                }
            }
        },

        events: {
            emits: ['nvr:state_change', 'nvr:events:ui', 'nvr:events:dispatcher', 'nvr:events:alerts'],
            listens: ['exec34:critical_fail', 'ARMING_STATE_CHANGED']
        },

        dependencies: ['recorder', 'ai', 'arming', 'live']
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════

class ContractValidator {
    constructor(redis) {
        this.redis = redis;
        this.contracts = MODULE_CONTRACTS;
        this.validationResults = new Map();
    }

    // Simple JSON Schema validation (subset)
    validateSchema(data, schema, path = '') {
        const errors = [];

        if (schema.type) {
            const actualType = Array.isArray(data) ? 'array' : typeof data;
            if (schema.type !== actualType && data !== null && data !== undefined) {
                errors.push(`${path}: Expected ${schema.type}, got ${actualType}`);
            }
        }

        if (schema.required && schema.type === 'object' && data) {
            for (const req of schema.required) {
                if (!(req in data)) {
                    errors.push(`${path}: Missing required field '${req}'`);
                }
            }
        }

        if (schema.properties && data && typeof data === 'object') {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (key in data) {
                    errors.push(...this.validateSchema(data[key], propSchema, `${path}.${key}`));
                }
            }
        }

        if (schema.enum && data !== undefined) {
            if (!schema.enum.includes(data)) {
                errors.push(`${path}: Value '${data}' not in enum [${schema.enum.join(', ')}]`);
            }
        }

        if (schema.minimum !== undefined && typeof data === 'number') {
            if (data < schema.minimum) {
                errors.push(`${path}: Value ${data} below minimum ${schema.minimum}`);
            }
        }

        return errors;
    }

    // Validate module output against contract
    async validateOutput(moduleName, outputName, data) {
        const contract = this.contracts[moduleName];
        if (!contract) return { valid: false, errors: [`No contract for module '${moduleName}'`] };

        const outputSchema = contract.outputs?.[outputName];
        if (!outputSchema) return { valid: false, errors: [`No output schema for '${outputName}'`] };

        const errors = this.validateSchema(data, outputSchema, outputName);

        const result = {
            valid: errors.length === 0,
            errors,
            module: moduleName,
            output: outputName,
            timestamp: Date.now()
        };

        this.validationResults.set(`${moduleName}:${outputName}`, result);

        if (!result.valid && CONTRACT_CONFIG.BREAK_ON_MISMATCH) {
            console.error(`[Contracts] VALIDATION FAILED: ${moduleName}:${outputName}`);
            errors.forEach(e => console.error(`  - ${e}`));

            await this.redis.publish('nvr:events:alerts', JSON.stringify({
                type: 'CONTRACT_VIOLATION',
                module: moduleName,
                output: outputName,
                errors,
                timestamp: Date.now()
            }));
        }

        return result;
    }

    // Check module dependencies
    validateDependencies(moduleName, runningModules) {
        const contract = this.contracts[moduleName];
        if (!contract) return { valid: false, missing: [], reason: 'No contract' };

        const deps = contract.dependencies || [];
        const missing = deps.filter(d => !runningModules.includes(d));

        return {
            valid: missing.length === 0,
            missing,
            dependencies: deps
        };
    }

    // Get contract for module
    getContract(moduleName) {
        return this.contracts[moduleName] || null;
    }

    // Get all contracts
    getAllContracts() {
        return this.contracts;
    }

    // Compare contract versions (semver)
    compareVersions(v1, v2) {
        const parse = (v) => v.split('.').map(Number);
        const [major1, minor1, patch1] = parse(v1);
        const [major2, minor2, patch2] = parse(v2);

        if (major1 !== major2) return major1 - major2; // Breaking change
        if (minor1 !== minor2) return minor1 - minor2; // Feature addition
        return patch1 - patch2; // Bug fix
    }

    // Check if contract version is compatible
    isCompatible(required, provided) {
        const [reqMajor] = required.split('.').map(Number);
        const [provMajor] = provided.split('.').map(Number);
        return reqMajor === provMajor; // Major version must match
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT MANAGER
// ═══════════════════════════════════════════════════════════════════════════

class ContractManager {
    constructor() {
        this.redis = new Redis();
        this.validator = new ContractValidator(this.redis);
        this.initialized = false;
    }

    async init() {
        console.log('[Contracts] Initializing Module Contract System...');
        console.log(`[Contracts] Profile: ${CONTRACT_CONFIG.PROFILE}`);
        console.log(`[Contracts] Format: ${CONTRACT_CONFIG.FORMAT}`);
        console.log(`[Contracts] Enforce: ${CONTRACT_CONFIG.ENFORCE_BOUNDARIES}`);

        // Persist contracts to Redis
        if (CONTRACT_CONFIG.PERSIST) {
            await this.persistContracts();
        }

        // Validate on start
        if (CONTRACT_CONFIG.VALIDATE_ON_START) {
            await this.validateAllModules();
        }

        // Start validation loop
        this.startValidationLoop();

        this.initialized = true;
        console.log('[Contracts] Module Contract System ACTIVE');

        // Emit init event
        await this.redis.publish('nvr:events:ui', JSON.stringify({
            type: 'CONTRACTS_INITIALIZED',
            modules: Object.keys(MODULE_CONTRACTS),
            timestamp: Date.now()
        }));
    }

    async persistContracts() {
        for (const [name, contract] of Object.entries(MODULE_CONTRACTS)) {
            await this.redis.set(
                `${CONTRACT_CONFIG.REDIS_PREFIX}${name}`,
                JSON.stringify(contract)
            );
        }

        // Store config
        await this.redis.set(
            `${CONTRACT_CONFIG.REDIS_PREFIX}config`,
            JSON.stringify(CONTRACT_CONFIG)
        );

        console.log(`[Contracts] Persisted ${Object.keys(MODULE_CONTRACTS).length} contracts to Redis`);
    }

    async validateAllModules() {
        console.log('[Contracts] Validating all module contracts...');

        const results = {};

        // Validate Recorder
        const recorderProof = await this.redis.get('recorder:functional_proof');
        if (recorderProof) {
            try {
                const data = JSON.parse(recorderProof);
                results.recorder = await this.validator.validateOutput('recorder', 'functional_proof', data);
            } catch (e) {
                results.recorder = { valid: false, errors: [e.message] };
            }
        } else {
            results.recorder = { valid: false, errors: ['No data'] };
        }

        // Validate AI
        const motionProof = await this.redis.get('motion:functional_proof');
        if (motionProof) {
            try {
                const data = JSON.parse(motionProof);
                results.ai = await this.validator.validateOutput('ai', 'functional_proof', data);
            } catch (e) {
                results.ai = { valid: false, errors: [e.message] };
            }
        } else {
            results.ai = { valid: false, errors: ['No data'] };
        }

        // Validate NVR State
        const nvrState = await this.redis.get('nvr:global_state');
        if (nvrState) {
            try {
                const data = JSON.parse(nvrState);
                results.nvr = await this.validator.validateOutput('nvr', 'global_state', data);
            } catch (e) {
                results.nvr = { valid: false, errors: [e.message] };
            }
        } else {
            results.nvr = { valid: false, errors: ['No data'] };
        }

        // Persist results
        await this.redis.set(`${CONTRACT_CONFIG.REDIS_PREFIX}validation_results`, JSON.stringify({
            results,
            timestamp: Date.now()
        }));

        // Log summary
        const passed = Object.values(results).filter(r => r.valid).length;
        const total = Object.keys(results).length;
        console.log(`[Contracts] Validation: ${passed}/${total} modules passed`);

        return results;
    }

    startValidationLoop() {
        setInterval(async () => {
            await this.validateAllModules();
        }, 30000); // Every 30s
    }

    // API: Get contract for module
    getContract(moduleName) {
        return this.validator.getContract(moduleName);
    }

    // API: Get all contracts
    getAllContracts() {
        return this.validator.getAllContracts();
    }

    // API: Validate specific output
    async validateOutput(moduleName, outputName, data) {
        return this.validator.validateOutput(moduleName, outputName, data);
    }

    // API: Get validation status
    async getValidationStatus() {
        const results = await this.redis.get(`${CONTRACT_CONFIG.REDIS_PREFIX}validation_results`);
        return results ? JSON.parse(results) : null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

let instance = null;

async function initContracts() {
    if (!instance) {
        instance = new ContractManager();
        await instance.init();
    }
    return instance;
}

function getContractManager() {
    return instance;
}

module.exports = {
    ContractManager,
    ContractValidator,
    MODULE_CONTRACTS,
    CONTRACT_CONFIG,
    initContracts,
    getContractManager
};
