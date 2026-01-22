// src/services/PlaybackSessionFactory.js
import { PlaybackSession } from './PlaybackSession';
import { mediaAuthority } from './MediaAuthority';
import { store } from '../store/store';
import { addSession, removeSession } from '../store/playbackSlice';
import { v4 as uuidv4 } from 'uuid';

/**
 * Factory that creates a PlaybackSession, registers it with MediaAuthority,
 * and persists it via Redux store (and optionally via backend API).
 */
export const PlaybackSessionFactory = {
    async create(cameraId, baseUrl) {
        const session = new PlaybackSession(cameraId, baseUrl);
        // Register with MediaAuthority (already done in constructor)
        // Persist in Redux store
        store.dispatch(addSession({
            id: session.id,
            cameraId,
            startEpoch: null,
            state: 'STOPPED'
        }));
        // Optional: persist to backend (not required for demo)
        return session;
    }
};
