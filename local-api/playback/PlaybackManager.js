const sessions = new Map();

function createSession(id, sessionObj) {
    sessions.set(id, sessionObj);
}

function getSession(id) {
    return sessions.get(id);
}

function removeSession(id) {
    const s = sessions.get(id);
    if (s) {
        s.stop();
        sessions.delete(id);
    }
}

// Optional: Reaper for old sessions
setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
        // If session created > 1 hour ago and not active? 
        // Logic depends on usage. For now we rely on explicit stops or connection close.
    }
}, 60000);

module.exports = {
    sessions,
    createSession,
    getSession,
    removeSession
};
