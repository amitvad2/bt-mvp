import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockGetDocs = vi.fn();

vi.mock('next/navigation', () => {
    const params = new URLSearchParams();
    return {
        useSearchParams: () => params,
        useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
        ReadonlyURLSearchParams: URLSearchParams,
    };
});

vi.mock('next/link', () => ({
    default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    getDocs: (...args: any[]) => mockGetDocs(...args),
    where: vi.fn(),
    orderBy: vi.fn(),
}));

// Leaflet / map component requires browser APIs not available in jsdom
vi.mock('@/components/home/SessionMapSection', () => ({
    default: () => <div data-testid="session-map">Map</div>,
}));

vi.mock('@/components/sessions/BundleBrowser', () => ({
    default: () => null,
}));

vi.mock('@/components/sessions/TermScheduleView', () => ({
    default: () => null,
}));

vi.mock('@/lib/term-schedule-utils', () => ({
    getActiveSessionCount: (schedule: any[]) =>
        schedule.filter((e: any) => e.status === 'active').length,
}));

import SessionBrowser from '@/components/sessions/SessionBrowser';

describe('SessionBrowser default view', () => {
    const noop = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetDocs.mockResolvedValue({ docs: [] });
    });

    it('renders List view as the default on initial load', async () => {
        render(<SessionBrowser onBook={noop} />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument();
        });

        const listBtn = screen.getByRole('button', { name: /list/i });
        const mapBtn = screen.getByRole('button', { name: /map/i });
        expect(listBtn.className).toMatch(/active/);
        expect(mapBtn.className).not.toMatch(/active/);
    });

    it('does not render the map on initial load', async () => {
        render(<SessionBrowser onBook={noop} />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument();
        });

        expect(screen.queryByTestId('session-map')).not.toBeInTheDocument();
    });

    it('shows the map when the Map button is clicked', async () => {
        render(<SessionBrowser onBook={noop} />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /map/i })).toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole('button', { name: /map/i }));
        expect(screen.getByTestId('session-map')).toBeInTheDocument();
    });

    it('switches back to List view when List button is clicked after Map', async () => {
        render(<SessionBrowser onBook={noop} />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /map/i })).toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole('button', { name: /map/i }));
        await userEvent.click(screen.getByRole('button', { name: /list/i }));
        expect(screen.queryByTestId('session-map')).not.toBeInTheDocument();
    });
});
