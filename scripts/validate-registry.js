#!/usr/bin/env node
/**
 * EXEC-30: Service Registry Validator
 * 
 * Validates service-registry.json for completeness and correctness
 * Run: node scripts/validate-registry.js
 */

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '../config/service-registry.json');
const REQUIRED_FIELDS = ['name', 'role', 'type', 'binary', 'criticality'];
const ALLOWED_TYPES = ['systemd', 'internal', 'external', 'child'];
const ALLOWED_CRITICALITY = ['critical', 'non-critical'];

let errors = [];
let warnings = [];

console.log('🔍 EXEC-30: Validating Service Registry...\n');

// Load registry
let registry;
try {
    const rawData = fs.readFileSync(REGISTRY_PATH, 'utf8');
    registry = JSON.parse(rawData);
    console.log('✅ Registry loaded successfully');
} catch (error) {
    console.error('❌ CRITICAL:', error.message);
    process.exit(1);
}

// Validate structure
if (!registry.services) {
    errors.push('Missing "services" section');
}

if (!registry.enforcement) {
    warnings.push('Missing "enforcement" section - defaults will be used');
}

// Validate each service
let serviceCount = 0;
const serviceNames = new Set();

console.log('\n📋 Validating Services:\n');

for (const category in registry.services) {
    const services = registry.services[category];
    console.log(`  📁 Category: ${category}`);

    for (const serviceName in services) {
        serviceCount++;
        const service = services[serviceName];

        // Check for duplicate names across categories
        if (serviceNames.has(serviceName)) {
            errors.push(`Duplicate service name: ${serviceName}`);
        }
        serviceNames.add(serviceName);

        // Check required fields
        for (const field of REQUIRED_FIELDS) {
            if (!service[field]) {
                errors.push(`${serviceName}: Missing required field "${field}"`);
            }
        }

        // Validate type
        if (service.type && !ALLOWED_TYPES.includes(service.type)) {
            errors.push(`${serviceName}: Invalid type "${service.type}". Must be one of: ${ALLOWED_TYPES.join(', ')}`);
        }

        // Validate criticality
        if (service.criticality && !ALLOWED_CRITICALITY.includes(service.criticality)) {
            errors.push(`${serviceName}: Invalid criticality "${service.criticality}". Must be one of: ${ALLOWED_CRITICALITY.join(', ')}`);
        }

        // Check binary exists (on local system for development)
        if (service.binary && !service.binary.includes('node_modules')) {
            const localBinary = service.binary.replace('/opt/dss-edge', path.join(__dirname, '..'));
            const altBinary = path.join(__dirname, '..', service.binary);

            // For system binaries, just warn
            if (!service.binary.startsWith('/usr/')) {
                if (!fs.existsSync(localBinary) && !fs.existsSync(altBinary)) {
                    warnings.push(`${serviceName}: Binary "${service.binary}" may not exist on deployment`);
                }
            }
        }

        // Validate health check
        if (service.healthCheck) {
            const hc = service.healthCheck;
            if (!hc.type) {
                errors.push(`${serviceName}: Health check missing "type"`);
            }

            switch (hc.type) {
                case 'redis':
                    if (!hc.key) errors.push(`${serviceName}: Redis health check missing "key"`);
                    break;
                case 'file':
                    if (!hc.path) errors.push(`${serviceName}: File health check missing "path"`);
                    break;
                case 'process':
                    if (!hc.pidFile) errors.push(`${serviceName}: Process health check missing "pidFile"`);
                    break;
                case 'http':
                    if (!hc.endpoint) errors.push(`${serviceName}: HTTP health check missing "endpoint"`);
                    break;
            }
        }

        // Validate parent reference
        if (service.parent && service.type !== 'systemd') {
            if (!serviceNames.has(service.parent) && service.parent !== 'systemd') {
                warnings.push(`${serviceName}: Parent "${service.parent}" not found in registry`);
            }
        }

        console.log(`    ✓ ${serviceName} (${service.type}, ${service.criticality})`);
    }
}

console.log(`\n📊 Summary:`);
console.log(`  Total services: ${serviceCount}`);
console.log(`  Categories: ${Object.keys(registry.services).length}`);

// Check for critical services
const criticalServices = [];
for (const cat in registry.services) {
    for (const name in registry.services[cat]) {
        if (registry.services[cat][name].criticality === 'critical') {
            criticalServices.push(name);
        }
    }
}
console.log(`  Critical services: ${criticalServices.length}`);
console.log(`    - ${criticalServices.join('\n    - ')}`);

// Report results
console.log('\n' + '='.repeat(60));

if (errors.length > 0) {
    console.log('\n❌ ERRORS:');
    errors.forEach(err => console.log(`  - ${err}`));
}

if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(warn => console.log(`  - ${warn}`));
}

if (errors.length === 0) {
    console.log('\n✅ Registry validation PASSED');
    console.log('   Ready for deployment');
    process.exit(0);
} else {
    console.log(`\n❌ Registry validation FAILED (${errors.length} errors)`);
    console.log('   Fix errors before deployment');
    process.exit(1);
}
