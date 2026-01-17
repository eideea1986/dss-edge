const { spawn } = require("child_process");

class Supervisor {
    constructor(service, redis) {
        this.service = service;
        this.redis = redis;
        this.proc = null;
        this.retries = 0;
        this.name = service.name;
        this.isCritical = service.critical || false;
    }

    start() {
        if (this.proc) return;

        console.log(`[SUPERVISOR] Starting service: ${this.name} (${this.service.cmd.join(' ')})`);

        const [cmd, ...args] = this.service.cmd;

        this.proc = spawn(cmd, args, {
            stdio: "inherit",
            env: { ...process.env, ...this.service.env }
        });

        this.proc.on("exit", (code, signal) => {
            console.warn(`[SUPERVISOR] Service ${this.name} exited with code ${code} / signal ${signal}`);
            this.proc = null;
            this.retries++;
            // Simple immediate restart logic managed by Orchestrator monitoring loop, 
            // but we can flag it here.
        });

        this.proc.on("error", (err) => {
            console.error(`[SUPERVISOR] Service ${this.name} failed to spawn:`, err);
        });
    }

    stop() {
        if (this.proc) {
            console.log(`[SUPERVISOR] Stopping service: ${this.name}`);
            this.proc.kill("SIGTERM");
            // Force kill if needed after timeout? For now trust SIGTERM.
            this.proc = null;
        }
    }

    async checkHealth() {
        // 1. Process Check
        if (!this.proc) return false;

        // 2. Redis Heartbeat Check (if configured)
        if (this.service.heartbeatKey) {
            const ts = await this.redis.get(this.service.heartbeatKey);
            if (!ts) return false; // No heartbeat yet
            const drift = Date.now() - Number(ts);
            if (drift > 10000) { // 10s tolerance
                console.warn(`[SUPERVISOR] Service ${this.name} heartbeat stale: ${drift}ms`);
                return false;
            }
        }
        return true;
    }
}

module.exports = Supervisor;
