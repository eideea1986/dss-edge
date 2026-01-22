// local-api/store/playbackStore.js
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const file = path.join(__dirname, 'playbackStore.json');
const adapter = new FileSync(file);
const db = low(adapter);

// Set defaults
db.defaults({ sessions: [] }).write();

/** Create a new playback session record */
async function create({ id, cameraId, startEpoch, state }) {
    const session = { id, cameraId, startEpoch, state, createdAt: Date.now() };
    db.get('sessions').push(session).write();
    return session;
}

/** Remove a playback session */
async function remove(id) {
    db.get('sessions').remove({ id }).write();
}

/** List all playback sessions */
async function list() {
    return db.get('sessions').value();
}

module.exports = { create, remove, list };
