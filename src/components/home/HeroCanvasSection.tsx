'use client';

import dynamic from 'next/dynamic';

const HeroCanvas = dynamic(() => import('./HeroCanvas'), { ssr: false, loading: () => null });

export default function HeroCanvasSection() {
    return <HeroCanvas />;
}
