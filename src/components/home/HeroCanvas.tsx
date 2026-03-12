'use client';

import { useEffect, useRef } from 'react';

const FOOD_ITEMS = ['🍳', '🥘', '🍰', '🥗', '🫕', '🍜', '🥐', '🍕', '🥦', '✨', '🌟', '🍓', '🫐', '🥕', '🍋', '🫙'];

interface FoodParticle {
    x: number;
    y: number;
    emoji: string;
    size: number;
    speed: number;
    opacity: number;
    rotation: number;
    rotationSpeed: number;
    drift: number; // horizontal drift
    driftAngle: number;
}

function createParticle(canvasWidth: number, canvasHeight: number, fromBottom = false): FoodParticle {
    return {
        x: Math.random() * canvasWidth,
        y: fromBottom ? canvasHeight + 60 : Math.random() * canvasHeight,
        emoji: FOOD_ITEMS[Math.floor(Math.random() * FOOD_ITEMS.length)],
        size: Math.random() * 30 + 24, // Increased size
        speed: Math.random() * 0.5 + 0.2,
        opacity: Math.random() * 0.3 + 0.2, // Increased opacity (brighter)
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.012,
        drift: 0,
        driftAngle: Math.random() * Math.PI * 2,
    };
}

export default function HeroCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);

    useEffect(() => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        let particles: FoodParticle[] = [];

        const resize = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            // Re-seed particles on resize
            particles = Array.from({ length: 28 }, () =>
                createParticle(canvas.width, canvas.height, false)
            );
        };

        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);

        // Pre-render emoji to off-screen canvas for performance
        function getEmojiImage(emoji: string, size: number): HTMLCanvasElement {
            const off = document.createElement('canvas');
            off.width = size * 2;
            off.height = size * 2;
            const octx = off.getContext('2d')!;
            octx.font = `${size}px serif`;
            octx.textAlign = 'center';
            octx.textBaseline = 'middle';
            octx.fillText(emoji, size, size);
            return off;
        }

        const emojiCache = new Map<string, HTMLCanvasElement>();

        function getOrCreateEmoji(emoji: string, size: number) {
            const key = `${emoji}-${Math.round(size)}`;
            if (!emojiCache.has(key)) emojiCache.set(key, getEmojiImage(emoji, size));
            return emojiCache.get(key)!;
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (const p of particles) {
                // Gentle sine-wave drift
                p.driftAngle += 0.008;
                p.drift = Math.sin(p.driftAngle) * 0.4;

                p.x += p.drift;
                p.y -= p.speed;
                p.rotation += p.rotationSpeed;

                // Reset when floated off top
                if (p.y < -80) {
                    const fresh = createParticle(canvas.width, canvas.height, true);
                    Object.assign(p, fresh);
                }

                ctx.save();
                ctx.globalAlpha = p.opacity;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                const img = getOrCreateEmoji(p.emoji, p.size);
                ctx.drawImage(img, -p.size, -p.size, p.size * 2, p.size * 2);
                ctx.restore();
            }

            rafRef.current = requestAnimationFrame(animate);
        }

        animate();

        return () => {
            cancelAnimationFrame(rafRef.current);
            ro.disconnect();
            emojiCache.clear();
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 0,
            }}
        />
    );
}
