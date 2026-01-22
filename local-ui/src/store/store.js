// src/store/store.js
import { configureStore } from '@reduxjs/toolkit';
import playbackReducer from './playbackSlice';

export const store = configureStore({
    reducer: {
        playback: playbackReducer,
    },
});
