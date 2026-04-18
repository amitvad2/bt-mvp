'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import SessionBrowser from '@/components/sessions/SessionBrowser';

export default function ClassesClient() {
    const { user } = useAuth();
    const router = useRouter();

    const handleBook = (sessionId: string) => {
        const bookingUrl = `/book/${sessionId}/student`;
        if (user) {
            router.push(bookingUrl);
        } else {
            router.push(`/auth/login?redirect=${encodeURIComponent(bookingUrl)}`);
        }
    };

    return <SessionBrowser onBook={handleBook} />;
}
