import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { User } from 'firebase/auth';

vi.mock('@/context/AuthContext', () => ({
    useAuth: vi.fn(),
}));

vi.mock('next/link', () => ({
    default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
        <a href={href} className={className}>{children}</a>
    ),
}));

import { useAuth } from '@/context/AuthContext';
import { TestimoniesCtaButtons } from '@/app/(public)/testimonies/TestimoniesCtaButtons';

const mockUseAuth = vi.mocked(useAuth);

const asLoggedOut = () =>
    mockUseAuth.mockReturnValue({ user: null, btUser: null, loading: false, signUp: vi.fn(), signIn: vi.fn(), signInWithGoogle: vi.fn(), logOut: vi.fn(), resetPassword: vi.fn() });

const asLoggedIn = () =>
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } as User, btUser: null, loading: false, signUp: vi.fn(), signIn: vi.fn(), signInWithGoogle: vi.fn(), logOut: vi.fn(), resetPassword: vi.fn() });

describe('TestimoniesCtaButtons', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('logged-out: "Find a Class" links to public /classes page', () => {
        asLoggedOut();
        render(<TestimoniesCtaButtons />);
        expect(screen.getByRole('link', { name: /find a class/i })).toHaveAttribute('href', '/classes');
    });

    it('logged-out: shows Register Now link to /auth/signup', () => {
        asLoggedOut();
        render(<TestimoniesCtaButtons />);
        expect(screen.getByRole('link', { name: /register now/i })).toHaveAttribute('href', '/auth/signup');
    });

    it('logged-in: "Find a Class" links to /portal/find-class', () => {
        asLoggedIn();
        render(<TestimoniesCtaButtons />);
        expect(screen.getByRole('link', { name: /find a class/i })).toHaveAttribute('href', '/portal/find-class');
    });

    it('logged-in: shows My Portal link', () => {
        asLoggedIn();
        render(<TestimoniesCtaButtons />);
        expect(screen.getByRole('link', { name: /my portal/i })).toBeInTheDocument();
    });

    it('logged-in: no Register link visible', () => {
        asLoggedIn();
        render(<TestimoniesCtaButtons />);
        expect(screen.queryByRole('link', { name: /register/i })).not.toBeInTheDocument();
    });
});
