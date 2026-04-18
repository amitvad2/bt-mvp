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
import { HeroCtas, BannerCtas } from '@/app/(public)/HomeCtaButtons';

const mockUseAuth = vi.mocked(useAuth);

const asLoggedOut = () =>
    mockUseAuth.mockReturnValue({ user: null, btUser: null, loading: false, signUp: vi.fn(), signIn: vi.fn(), signInWithGoogle: vi.fn(), logOut: vi.fn(), resetPassword: vi.fn() });

const asLoggedIn = () =>
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } as User, btUser: null, loading: false, signUp: vi.fn(), signIn: vi.fn(), signInWithGoogle: vi.fn(), logOut: vi.fn(), resetPassword: vi.fn() });

describe('HeroCtas', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('logged-out: "Book a Class" links to /classes', () => {
        asLoggedOut();
        render(<HeroCtas />);
        expect(screen.getByRole('link', { name: /book a class/i })).toHaveAttribute('href', '/classes');
    });

    it('logged-out: shows Register Free link', () => {
        asLoggedOut();
        render(<HeroCtas />);
        expect(screen.getByRole('link', { name: /register free/i })).toBeInTheDocument();
    });

    it('logged-in: "Book a Class" links to /portal/find-class', () => {
        asLoggedIn();
        render(<HeroCtas />);
        expect(screen.getByRole('link', { name: /book a class/i })).toHaveAttribute('href', '/portal/find-class');
    });

    it('logged-in: shows My Portal link instead of Register Free', () => {
        asLoggedIn();
        render(<HeroCtas />);
        expect(screen.getByRole('link', { name: /my portal/i })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /register/i })).not.toBeInTheDocument();
    });
});

describe('BannerCtas', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('logged-out: "Find a Class" links to /classes', () => {
        asLoggedOut();
        render(<BannerCtas />);
        expect(screen.getByRole('link', { name: /find a class/i })).toHaveAttribute('href', '/classes');
    });

    it('logged-out: shows Register Free link to /auth/signup', () => {
        asLoggedOut();
        render(<BannerCtas />);
        expect(screen.getByRole('link', { name: /register free/i })).toHaveAttribute('href', '/auth/signup');
    });

    it('logged-in: shows Find a Class and My Portal, no Register link', () => {
        asLoggedIn();
        render(<BannerCtas />);
        expect(screen.getByRole('link', { name: /find a class/i })).toHaveAttribute('href', '/portal/find-class');
        expect(screen.getByRole('link', { name: /my portal/i })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /register/i })).not.toBeInTheDocument();
    });
});
