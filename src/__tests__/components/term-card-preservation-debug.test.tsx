import { describe, it, expect, vi } from 'vitest';

// Mock lucide-react to avoid loading the entire icon library
vi.mock('lucide-react', () => ({
  Map: () => 'Map',
  List: () => 'List',
  ChevronDown: () => 'V',
  ChevronUp: () => '^',
  ChefHat: () => 'C',
  Clock: () => 'Cl',
  MapPin: () => 'P',
  User: () => 'U',
  Users: () => 'Us',
  Calendar: () => 'Cal',
  Tag: () => 'Tag',
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('@/components/home/SessionMapSection', () => ({
  default: () => <div data-testid="session-map">Map</div>,
}));

vi.mock('@/components/sessions/BundleBrowser', () => ({
  default: () => null,
}));

vi.mock('@/components/sessions/TermScheduleView', () => ({
  default: () => <div data-testid="term-schedule-view">TSV</div>,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  where: vi.fn(),
  orderBy: vi.fn(),
  getFirestore: vi.fn(),
}));

import { render, screen, waitFor } from '@testing-library/react';
import SessionBrowser from '@/components/sessions/SessionBrowser';

describe('Debug - SessionBrowser renders', () => {
  it('renders without crashing', async () => {
    render(<SessionBrowser onBook={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/0 result/)).toBeInTheDocument();
    });
  });
});
