import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { User } from 'firebase/auth';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: vi.fn(),
}));

// Stub SessionBrowser so tests control when onBook fires without hitting Firestore
vi.mock('@/components/sessions/SessionBrowser', () => ({
    default: ({ onBook }: { onBook: (id: string) => void }) => (
        <button onClick={() => onBook('session-123')}>Book Now</button>
    ),
}));

import { useAuth } from '@/context/AuthContext';
import ClassesClient from '@/app/(public)/classes/ClassesClient';

const mockUseAuth = vi.mocked(useAuth);

const asLoggedOut = () =>
    mockUseAuth.mockReturnValue({ user: null, btUser: null, loading: false, signUp: vi.fn(), signIn: vi.fn(), signInWithGoogle: vi.fn(), logOut: vi.fn(), resetPassword: vi.fn() });

const asLoggedIn = () =>
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } as User, btUser: null, loading: false, signUp: vi.fn(), signIn: vi.fn(), signInWithGoogle: vi.fn(), logOut: vi.fn(), resetPassword: vi.fn() });

describe('ClassesClient booking redirect', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('logged-out: redirects to /auth/login with booking URL as redirect param', async () => {
        asLoggedOut();
        render(<ClassesClient />);
        await userEvent.click(screen.getByRole('button', { name: /book now/i }));
        expect(mockPush).toHaveBeenCalledWith(
            '/auth/login?redirect=%2Fbook%2Fsession-123%2Fstudent'
        );
    });

    it('logged-in: navigates directly to booking wizard', async () => {
        asLoggedIn();
        render(<ClassesClient />);
        await userEvent.click(screen.getByRole('button', { name: /book now/i }));
        expect(mockPush).toHaveBeenCalledWith('/book/session-123/student');
    });
});
