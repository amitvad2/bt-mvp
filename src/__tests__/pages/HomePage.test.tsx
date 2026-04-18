import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
    default: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a>,
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: vi.fn(() => ({ user: null, loading: false })),
}));

// SessionMapSection uses Leaflet which requires browser APIs not in jsdom
vi.mock('@/components/home/SessionMapSection', () => ({
    default: () => <section data-testid="session-map-section">Classes near you</section>,
}));

// HomeCtaButtons are client islands tested separately
vi.mock('@/app/(public)/HomeCtaButtons', () => ({
    HeroCtas: () => <div data-testid="hero-ctas" />,
    BannerCtas: () => <div data-testid="banner-ctas" />,
}));

import HomePage from '@/app/(public)/page';

describe('Homepage section order', () => {
    it('renders "Choose your cooking journey" before "Classes near you / Find a class"', () => {
        render(<HomePage />);

        const journey = screen.getByRole('heading', { name: /choose your cooking journey/i });
        const map = screen.getByTestId('session-map-section');

        // compareDocumentPosition: 4 means journey comes before map in the DOM
        expect(
            journey.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
    });

    it('renders "Choose your cooking journey" heading', () => {
        render(<HomePage />);
        expect(screen.getByRole('heading', { name: /choose your cooking journey/i })).toBeInTheDocument();
    });

    it('renders the map / find a class section', () => {
        render(<HomePage />);
        expect(screen.getByTestId('session-map-section')).toBeInTheDocument();
    });
});
