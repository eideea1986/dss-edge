const { spawn } = require("child_process");
const path = require("path");

// MINIMAL RESCUE CONFIGURATION
// Only Critical Services Enabled to save CPU and restore UI
const services = [
    {
        name: "Go2RTC",
        external: true,
        systemd: "dss-go2rtc",
        port: 1984,
        healthUrl: "http://127.0.0.1:1984/api/streams",
        critical: true
    },
    {
        name: "Local API",
        cmd: "node",
        args: ["local-api/server.js"],
        port: 8080,
        healthUrl: "http://127.0.0.1:8080/status",
        critical: true
    }
];

let processes = {};

function log(msg) {
    console.log(`[${new Date().toISOString()}] [RESCUE] ${msg}`);
}

function startProcess(service) {
    if (service.external) return;

    log(`Starting ${service.name}...`);
    const p = spawn(service.cmd, service.args, {
        stdio: "inherit",
        cwd: path.resolve(__dirname, "..")
    });

    processes[service.name] = p;

    p.on("exit", (code) => {
        log(`${service.name} exited (code ${code}). Restarting in 5s...`);
        setTimeout(() => startProcess(service), 5000);
    });

    p.on("error", (err) => {
        log(`${service.name} Error: ${err.message}`);
    });
}

log("Starting System in MINIMAL RESCUE MODE...");
services.forEach(startProcess);

setInterval(() => { }, 60000);
