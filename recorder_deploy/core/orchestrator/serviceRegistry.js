module.exports = [
    {
        name: "legacy-api",
        cmd: ["node", "/opt/dss-edge/local-api/server.js"],
        critical: true,
        env: { NODE_ENV: "production" },
        heartbeatKey: "hb:legacy-api",
        restart: { max: 999, backoffMs: 3000 }
    },
    {
        name: "recorder-v2",
        cmd: ["node", "/opt/dss-edge/modules/record/recorder_v2.js"],
        critical: true,
        heartbeatKey: "hb:recorder",
        restart: { max: 999, backoffMs: 5000 }
    },
    {
        name: "storage-indexer",
        cmd: ["node", "/opt/dss-edge/modules/record/storage_indexer.js"],
        critical: true,
        heartbeatKey: "hb:indexer",
        restart: { max: 999, backoffMs: 5000 }
    },
    {
        name: "retention-core",
        cmd: ["node", "/opt/dss-edge/modules/retention/retention_core.js"],
        critical: false,
        heartbeatKey: "hb:retention",
        restart: { max: 999, backoffMs: 60000 }
    },
    {
        name: "live-core",
        cmd: ["node", "/opt/dss-edge/modules/live/live_core.js"],
        critical: true,
        heartbeatKey: "hb:live",
        restart: { max: 999, backoffMs: 5000 }
    }
];
