// src/store/playbackSlice.js
import { createSlice } from '@reduxjs/toolkit';

// Load persisted sessions from localStorage (if any)
const persisted = localStorage.getItem('playbackSessions');
const initialState = {
    sessions: persisted ? JSON.parse(persisted) : []
};

const playbackSlice = createSlice({
    name: 'playback',
    initialState,
    reducers: {
        addSession: (state, action) => {
            state.sessions.push(action.payload);
            localStorage.setItem('playbackSessions', JSON.stringify(state.sessions));
        },
        removeSession: (state, action) => {
            state.sessions = state.sessions.filter(s => s.id !== action.payload);
            localStorage.setItem('playbackSessions', JSON.stringify(state.sessions));
        },
        updateSession: (state, action) => {
            const idx = state.sessions.findIndex(s => s.id === action.payload.id);
            if (idx >= 0) {
                state.sessions[idx] = { ...state.sessions[idx], ...action.payload };
                localStorage.setItem('playbackSessions', JSON.stringify(state.sessions));
            }
        }
    }
});

export const { addSession, removeSession, updateSession } = playbackSlice.actions;
export default playbackSlice.reducer;
