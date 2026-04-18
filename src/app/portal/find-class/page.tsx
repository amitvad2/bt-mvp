'use client';

import { useRouter } from 'next/navigation';
import SessionBrowser from '@/components/sessions/SessionBrowser';
import styles from './page.module.css';

export default function FindClassPage() {
    const router = useRouter();

    const handleBook = (sessionId: string) => {
        router.push(`/book/${sessionId}/student`);
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1>Find a Class</h1>
                <p>Browse available sessions and book your spot.</p>
            </div>
            <SessionBrowser onBook={handleBook} />
        </div>
    );
}
