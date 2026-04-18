import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
    where: vi.fn(),
}));

// Leaflet / map component requires browser APIs not available in jsdom
vi.mock('@/components/home/SessionMapSection', () => ({
    default: () => <div data-testid="session-map">Map</div>,
}));

import SessionBrowser from '@/components/sessions/SessionBrowser';

describe('SessionBrowser default view', () => {
    const noop = vi.fn();

    beforeEach(() => { vi.clearAllMocks(); });

    it('renders List view as the default on initial load', () => {
        render(<SessionBrowser onBook={noop} />);
        const listBtn = screen.getByRole('button', { name: /list/i });
        const mapBtn = screen.getByRole('button', { name: /map/i });
        expect(listBtn.className).toMatch(/active/);
        expect(mapBtn.className).not.toMatch(/active/);
    });

    it('does not render the map on initial load', () => {
        render(<SessionBrowser onBook={noop} />);
        expect(screen.queryByTestId('session-map')).not.toBeInTheDocument();
    });

    it('shows the map when the Map button is clicked', async () => {
        render(<SessionBrowser onBook={noop} />);
        await userEvent.click(screen.getByRole('button', { name: /map/i }));
        expect(screen.getByTestId('session-map')).toBeInTheDocument();
    });

    it('switches back to List view when List button is clicked after Map', async () => {
        render(<SessionBrowser onBook={noop} />);
        await userEvent.click(screen.getByRole('button', { name: /map/i }));
        await userEvent.click(screen.getByRole('button', { name: /list/i }));
        expect(screen.queryByTestId('session-map')).not.toBeInTheDocument();
    });
});
