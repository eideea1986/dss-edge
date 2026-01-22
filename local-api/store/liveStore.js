// local-api/store/liveStore.js
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const file = path.join(__dirname, 'liveStore.json');
const adapter = new FileSync(file);
const db = low(adapter);

// Set defaults
db.defaults({ sessions: [] }).write();

/** Create a new live session */
async function create({ cameraId, type }) {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const session = { id, cameraId, type, createdAt: Date.now() };
    db.get('sessions').push(session).write();
    return session;
}

/** Remove a session by its id */
async function remove(id) {
    db.get('sessions').remove({ id }).write();
}

/** List all sessions */
async function list() {
    return db.get('sessions').value();
}

module.exports = { create, remove, list };
