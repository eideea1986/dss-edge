import React, { useRef, useEffect, useState } from 'react';

export default function Timeline({
    events = [], // [{ start: timestamp, end: timestamp }]
    currentTime, // unix timestamp (ms) or relative seconds? Let's use Seconds from midnight
    duration = 86400, // 24 hours in seconds
    onSeek,
    height = 60
}) {
    const canvasRef = useRef(null);

    const [canvasWidth, setCanvasWidth] = useState(window.innerWidth);

    useEffect(() => {
        const handleResize = () => setCanvasWidth(window.innerWidth);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Fixed 24h Viewport Logic: No Zoom, No Scroll
    const pxPerSec = canvasWidth / 86400;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvasWidth;
        const h = height;
        canvas.width = width;
        canvas.height = h;

        ctx.clearRect(0, 0, width, h);

        // 1. Dark Theme Background
        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, width, h);

        const t2x = (t) => t * pxPerSec;

        // 2. Recording Segments
        const recAreaH = 40;
        const recAreaY = 0;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, recAreaY, width, recAreaH);

        // Actual Recording Blocks
        ctx.fillStyle = '#cf1010';
        events.forEach(ev => {
            const x = t2x(ev.start);
            const w = (ev.end - ev.start) * pxPerSec;
            if (x + w > 0 && x < width) {
                ctx.fillRect(x, recAreaY + 1, Math.max(w, 1), recAreaH - 2);
            }
        });

        // 3. Ruler (Fixed Hours)
        ctx.fillStyle = '#1c1c1c';
        ctx.fillRect(0, recAreaH, width, h - recAreaH);

        ctx.lineWidth = 1;
        ctx.font = '11px "Segoe UI", Roboto, Helvetica, sans-serif';
        ctx.textAlign = 'center';

        const hourStep = 3600;
        for (let t = 0; t <= 86400; t += hourStep) {
            const x = t2x(t);
            const hour = Math.floor(t / 3600);

            // Ticks
            ctx.strokeStyle = '#444';
            ctx.beginPath();
            ctx.moveTo(x, recAreaH);
            ctx.lineTo(x, h);
            ctx.stroke();

            // Labels
            ctx.fillStyle = '#aaa';
            const timeStr = `${hour.toString().padStart(2, '0')}:00`;
            if (hour < 24) {
                ctx.fillText(timeStr, x, h - 8);
            }
        }

        // 4. Playhead (Trassir Red with Marker)
        const cx = t2x(currentTime);
        if (cx >= 0 && cx <= width) {
            ctx.strokeStyle = '#ff4d4d';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.lineTo(cx, h);
            ctx.stroke();

            // Marker
            ctx.fillStyle = '#ff4d4d';
            ctx.beginPath();
            ctx.moveTo(cx - 5, 0);
            ctx.lineTo(cx + 5, 0);
            ctx.lineTo(cx, 8);
            ctx.fill();
        }

    }, [events, currentTime, height, canvasWidth, pxPerSec]);

    const handleClick = (e) => {
        const clickTime = e.nativeEvent.offsetX / pxPerSec;
        if (onSeek) onSeek(Math.max(0, Math.min(86400, clickTime)));
    };

    return (
        <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={height}
            style={{
                background: '#121212',
                cursor: 'pointer',
                width: '100%',
                display: 'block',
                touchAction: 'none'
            }}
            onClick={handleClick}
        />
    );
}
