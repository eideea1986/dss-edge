const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const config = require('../config/default.json');

async function initDatabase() {
    console.log('Initializing AI Intelligence Database...');

    // Check if MySQL is available
    try {
        const connection = await mysql.createConnection({
            host: config.database.host,
            port: config.database.port,
            user: config.database.user,
            password: config.database.password,
            database: config.database.database,
            multipleStatements: true
        });

        console.log('Connected to MySQL database');

        // Read schema file
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Execute schema
        console.log('Creating tables...');
        await connection.query(schema);

        console.log('✓ Tables created successfully');
        console.log('  - tracked_objects');
        console.log('  - intelligence_events');
        console.log('  - false_detection_zones');
        console.log('  - event_cooldowns');
        console.log('  - intelligence_stats');

        await connection.end();
        console.log('Database initialization complete!');
        return true;

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.warn('⚠ MySQL not available - running in MEMORY-ONLY mode');
            console.warn('  Database features will be disabled');
            console.warn('  All data will be lost on restart');
            return false;
        }
        console.error('Database initialization failed:', error.message);
        return false;
    }
}

// Run if called directly
if (require.main === module) {
    initDatabase().then(success => {
        if (!success) {
            console.log('\nNote: Module will run without database persistence');
            process.exit(0); // Still exit successfully
        }
    });
}

module.exports = initDatabase;
