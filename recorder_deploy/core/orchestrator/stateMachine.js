const STATES = {
    BOOT: "BOOT",
    INIT: "INIT",
    RUNNING: "RUNNING",
    DEGRADED: "DEGRADED",
    RECOVERING: "RECOVERING",
    SHUTDOWN: "SHUTDOWN"
};

class StateMachine {
    constructor() {
        this.state = STATES.BOOT;
    }

    transition(next) {
        if (this.state === next) return;
        console.log(`[ORCH] State Transition: ${this.state} -> ${next}`);
        this.state = next;
    }

    getState() {
        return this.state;
    }
}

module.exports = { STATES, StateMachine };
