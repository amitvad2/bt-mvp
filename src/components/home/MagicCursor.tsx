'use client';

import { useEffect, useRef } from 'react';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;       // 0–1, starts at 1, fades to 0
    decay: number;
    size: number;
    color: string;
    rotation: number;
    rotSpeed: number;
    shape: 'star' | 'circle' | 'spark';
}

const COLORS = [
    '#f59e0b', '#fbbf24', '#fcd34d',   // ambers / gold
    '#ec4899', '#f472b6', '#fb7185',   // pinks
    '#a78bfa', '#c4b5fd', '#818cf8',   // purples
    '#34d399', '#6ee7b7',               // greens
    '#fff',
];

function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, points = 4) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const radius = i % 2 === 0 ? r : r * 0.4;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
}

export default function MagicCursor() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particles = useRef<Particle[]>([]);
    const mouse = useRef({ x: -999, y: -999 });
    const animFrame = useRef<number>(0);
    const lastEmit = useRef(0);

    useEffect(() => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        // Track mouse
        const onMove = (e: MouseEvent) => {
            mouse.current = { x: e.clientX, y: e.clientY };
            const now = Date.now();
            // Emit particles on mouse move, throttled
            if (now - lastEmit.current > 16) {
                lastEmit.current = now;
                spawnBurst(e.clientX, e.clientY, 3);
            }
        };
        window.addEventListener('mousemove', onMove);

        // Click burst
        const onClick = (e: MouseEvent) => spawnBurst(e.clientX, e.clientY, 12);
        window.addEventListener('click', onClick);

        function spawnBurst(x: number, y: number, count: number) {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 3 + 0.5;
                particles.current.push({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 1.5,
                    life: 1,
                    decay: 0.02 + Math.random() * 0.03,
                    size: Math.random() * 8 + 3,
                    color: randomColor(),
                    rotation: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * 0.2,
                    shape: (['star', 'circle', 'spark'] as const)[Math.floor(Math.random() * 3)],
                });
            }
        }

        function drawWand(ctx: CanvasRenderingContext2D, x: number, y: number) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-Math.PI / 4);

            // Wand body
            const grad = ctx.createLinearGradient(-2, 0, 2, 28);
            grad.addColorStop(0, '#a78bfa');
            grad.addColorStop(1, '#4c1d95');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(-2, 0, 4, 28, 2);
            ctx.fill();

            // Wand tip glow
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 12;
            ctx.fillStyle = '#fef3c7';
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Star at tip
            ctx.fillStyle = '#f59e0b';
            drawStar(ctx, 0, 0, 5, 5);
            ctx.fill();

            ctx.restore();
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw wand at cursor
            const { x, y } = mouse.current;
            if (x > 0) drawWand(ctx, x, y);

            // Update + draw particles
            particles.current = particles.current.filter(p => p.life > 0);
            for (const p of particles.current) {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.08;          // gravity
                p.vx *= 0.98;          // air resistance
                p.life -= p.decay;
                p.rotation += p.rotSpeed;

                ctx.save();
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);

                if (p.shape === 'star') {
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 8;
                    drawStar(ctx, 0, 0, p.size, 4);
                    ctx.fill();
                } else if (p.shape === 'circle') {
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // Spark / comet line
                    const grad = ctx.createLinearGradient(0, 0, -p.vx * 6, -p.vy * 6);
                    grad.addColorStop(0, p.color);
                    grad.addColorStop(1, 'transparent');
                    ctx.strokeStyle = grad;
                    ctx.lineWidth = p.size / 4;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(-p.vx * 6, -p.vy * 6);
                    ctx.stroke();
                }

                ctx.restore();
            }

            animFrame.current = requestAnimationFrame(animate);
        }

        animate();

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('click', onClick);
            cancelAnimationFrame(animFrame.current);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0, left: 0,
                width: '100vw', height: '100vh',
                pointerEvents: 'none',
                zIndex: 9999,
                cursor: 'none',
            }}
        />
    );
}
