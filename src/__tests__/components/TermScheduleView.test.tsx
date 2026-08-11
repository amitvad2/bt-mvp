import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScheduleEntry } from '@/types';

import TermScheduleView from '@/components/sessions/TermScheduleView';

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    date: '2025-09-08',
    recipeId: 'rec_001',
    recipeName: 'Pasta Shapes',
    recipePhotoUrl: 'https://example.com/pasta.jpg',
    status: 'active',
    ...overrides,
  };
}

describe('TermScheduleView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders active entries with assigned recipes showing recipe name and photo', () => {
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08', recipeName: 'Pasta Shapes', recipePhotoUrl: 'https://example.com/pasta.jpg' }),
      makeEntry({ date: '2025-09-15', recipeId: 'rec_002', recipeName: 'Mini Pizzas', recipePhotoUrl: 'https://example.com/pizza.jpg' }),
    ];

    render(<TermScheduleView schedule={schedule} />);

    expect(screen.getByText('Pasta Shapes')).toBeInTheDocument();
    expect(screen.getByText('Mini Pizzas')).toBeInTheDocument();

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'https://example.com/pasta.jpg');
    expect(images[0]).toHaveAttribute('alt', 'Photo of Pasta Shapes');
    expect(images[1]).toHaveAttribute('src', 'https://example.com/pizza.jpg');
    expect(images[1]).toHaveAttribute('alt', 'Photo of Mini Pizzas');
  });

  it('shows "Recipe to be announced" for unassigned active entries', () => {
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08', recipeId: '', recipeName: '', recipePhotoUrl: '' }),
      makeEntry({ date: '2025-09-15', recipeId: '', recipeName: '', recipePhotoUrl: '' }),
    ];

    render(<TermScheduleView schedule={schedule} />);

    const tbas = screen.getAllByText('Recipe to be announced');
    expect(tbas).toHaveLength(2);
  });

  it('excludes skipped entries from rendered output', () => {
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08', recipeName: 'Pasta Shapes' }),
      makeEntry({ date: '2025-09-15', status: 'skipped', recipeName: 'Should Not Show' }),
      makeEntry({ date: '2025-09-22', recipeName: 'Mini Pizzas', recipeId: 'rec_003' }),
    ];

    render(<TermScheduleView schedule={schedule} />);

    expect(screen.getByText('Pasta Shapes')).toBeInTheDocument();
    expect(screen.getByText('Mini Pizzas')).toBeInTheDocument();
    expect(screen.queryByText('Should Not Show')).not.toBeInTheDocument();
  });

  it('shows ChefHat fallback when recipePhotoUrl is empty', () => {
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08', recipeId: 'rec_001', recipeName: 'Pasta Shapes', recipePhotoUrl: '' }),
    ];

    render(<TermScheduleView schedule={schedule} />);

    expect(screen.getByText('Pasta Shapes')).toBeInTheDocument();
    // No img element should be present
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // Fallback div with aria-hidden should exist
    const fallback = document.querySelector('[aria-hidden="true"]');
    expect(fallback).toBeInTheDocument();
  });

  it('displays correct active session count (e.g. "12 sessions")', () => {
    const schedule: ScheduleEntry[] = Array.from({ length: 12 }, (_, i) =>
      makeEntry({ date: `2025-09-${String(i + 1).padStart(2, '0')}` })
    );

    render(<TermScheduleView schedule={schedule} />);

    expect(screen.getByText('12 sessions')).toBeInTheDocument();
  });

  it('shows "Schedule coming soon" empty state when schedule is empty array', () => {
    render(<TermScheduleView schedule={[]} />);

    expect(screen.getByText('Schedule coming soon')).toBeInTheDocument();
  });

  it('shows "Schedule coming soon" when all entries are skipped', () => {
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08', status: 'skipped' }),
      makeEntry({ date: '2025-09-15', status: 'skipped' }),
      makeEntry({ date: '2025-09-22', status: 'skipped' }),
    ];

    render(<TermScheduleView schedule={schedule} />);

    expect(screen.getByText('Schedule coming soon')).toBeInTheDocument();
  });

  it('handles single entry correctly showing "1 session" not "1 sessions"', () => {
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08', recipeName: 'Pasta Shapes' }),
    ];

    render(<TermScheduleView schedule={schedule} />);

    expect(screen.getByText('1 session')).toBeInTheDocument();
    expect(screen.queryByText('1 sessions')).not.toBeInTheDocument();
  });
});
