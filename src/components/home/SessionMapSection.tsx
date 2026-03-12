'use client';

import dynamic from 'next/dynamic';

// This 'use client' wrapper lets us use ssr:false (not allowed in Server Components)
const SessionMapFinder = dynamic(() => import('./SessionMapFinder'), {
    ssr: false,
    loading: () => (
        <section
            className="section"
            style={{
                background: 'var(--bt-gray-100)',
                minHeight: 480,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <div style={{ color: 'var(--bt-gray-400)', textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                <p>Loading class finder…</p>
            </div>
        </section>
    ),
});

export default function SessionMapSection() {
    return <SessionMapFinder />;
}
