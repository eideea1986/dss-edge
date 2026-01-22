class ConnectionPool {
    constructor(maxSlots = 6) {
        this.maxSlots = maxSlots;
        this.current = 0;
        this.queue = [];
    }

    acquireSlot() {
        return new Promise(resolve => {
            if (this.current < this.maxSlots) {
                this.current++;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }

    releaseSlot() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next(); // give slot to next waiter
        } else {
            this.current = Math.max(0, this.current - 1);
        }
    }

    reset() {
        // clear pending promises and reset counters (used on page unload)
        this.queue = [];
        this.current = 0;
    }
}

const connectionPool = new ConnectionPool();
export default connectionPool;
