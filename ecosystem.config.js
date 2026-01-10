module.exports = {
    apps: [
        {
            name: "dss-edge-orchestrator",
            script: "./orchestrator/edgeOrchestrator.js",
            cwd: "/opt/dss-edge",
            watch: false,
            autorestart: true,
            env: {
                NODE_ENV: "production"
            }
        }
    ]
};
