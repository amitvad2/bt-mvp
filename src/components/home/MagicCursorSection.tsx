'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';

const MagicCursor = dynamic(() => import('./MagicCursor'), { ssr: false });

export default function MagicCursorSection() {
    // Hide the OS cursor on the whole document
    useEffect(() => {
        document.documentElement.style.cursor = 'none';
        return () => { document.documentElement.style.cursor = ''; };
    }, []);

    return <MagicCursor />;
}
