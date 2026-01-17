const Redis = require("ioredis");
const { StateMachine, STATES } = require("./stateMachine");
const Supervisor = require("./supervisor");
const services = require("./serviceRegistry");

// Connect to Redis (Local Bus)
const redis = new Redis({
    host: "127.0.0.1",
    port: 6379,
    retryStrategy: times => Math.min(times * 50, 2000)
});

const sm = new StateMachine();
const supervisors = services.map(s => new Supervisor(s, redis));

async function boot() {
    console.log("[ORCHESTRATOR] Booting Enterprise Core...");
    sm.transition(STATES.INIT);

    // Todo: Check Disk / Redis Connectivity here

    console.log("[ORCHESTRATOR] Starting Services...");
    supervisors.forEach(s => s.start());

    sm.transition(STATES.RUNNING);

    // Monitor Loop
    setInterval(monitor, 3000);
    setInterval(killGhosts, 30000); // 30s cleanup cycle
}

async function killGhosts() {
    const { exec } = require('child_process');

    // Get PIDs of processes managed by supervisors
    const managedPids = supervisors
        .map(s => s.proc ? s.proc.pid : null)
        .filter(pid => pid !== null);

    // Scan for all ffmpeg and node processes
    exec('ps -eo pid,ppid,cmd', (err, stdout) => {
        if (err) return;
        const lines = stdout.split('\n');

        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            const pid = parseInt(parts[0]);
            const ppid = parseInt(parts[1]);
            const cmd = parts.slice(2).join(' ');

            // Goal: Kill FFmpeg processes whose PPID is NOT in managedPids 
            // OR whose PPID is 1 (orphaned) AND relates to dss-edge
            if (cmd.includes('ffmpeg') && (cmd.includes('storage') || cmd.includes('recorder'))) {
                const isManaged = managedPids.includes(ppid);
                if (!isManaged || ppid === 1) {
                    console.warn(`[ORCHESTRATOR] Found ghost process: PID ${pid} (${cmd}). Killing...`);
                    try { process.kill(pid, 'SIGKILL'); } catch (e) { }
                }
            }
        });
    });
}

async function monitor() {
    let degraded = false;
    const healthReport = {};

    for (const sup of supervisors) {
        const ok = await sup.checkHealth();
        healthReport[sup.name] = ok ? "OK" : "FAIL";

        if (!ok) {
            if (sup.service.critical) degraded = true;

            // Auto-Restart logic
            if (!sup.proc) {
                console.warn(`[ORCHESTRATOR] Service ${sup.name} is down. Restarting...`);
                sup.start();
            }
        }
    }

    const targetedState = degraded ? STATES.DEGRADED : STATES.RUNNING;
    sm.transition(targetedState);

    // Publish Global State to Bus
    redis.set("global:state", sm.getState());
    redis.publish("global:state", sm.getState());
}

boot();
