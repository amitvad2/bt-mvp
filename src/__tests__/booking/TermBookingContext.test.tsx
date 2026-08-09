import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';
import { BTClass } from '@/types';

// Mock next/navigation
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: mockReplace }),
}));

// Mock firebase/firestore
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
    doc: vi.fn((_db, _collection, _id) => ({ path: `${_collection}/${_id}` })),
    getDoc: (...args: unknown[]) => mockGetDoc(...args),
    getDocs: (...args: unknown[]) => mockGetDocs(...args),
    collection: vi.fn((_db, _collection) => ({ path: _collection })),
}));

// Mock @/lib/firebase
vi.mock('@/lib/firebase', () => ({
    db: {},
}));

import { TermBookingProvider, useTermBooking } from '@/context/TermBookingContext';

function makeTermClass(overrides: Partial<BTClass> = {}): BTClass {
    return {
        id: 'class-1',
        type: 'kidsAfterSchool',
        name: 'Cooking Term',
        dayOfWeek: 'Monday',
        startTime: '15:30',
        endTime: '16:30',
        ageMin: 5,
        ageMax: 12,
        maxSize: 10,
        instructor: 'Chef Alice',
        venueId: 'venue-1',
        venueName: 'Community Hall',
        commitment: 'term',
        price: 1500,
        termStartDate: '2025-01-06',
        termEndDate: '2030-12-31',
        termPrice: 12000,
        recurrenceDays: ['Monday', 'Wednesday', 'Friday'],
        spotsAvailable: 5,
        createdAt: null,
        ...overrides,
    };
}

// Helper component that consumes the context to test its values
function TestConsumer() {
    const { state, loading, termClass } = useTermBooking();
    return (
        <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="classId">{state.classId}</span>
            <span data-testid="termClassName">{termClass?.name ?? 'none'}</span>
        </div>
    );
}

describe('TermBookingContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear sessionStorage between tests
        sessionStorage.clear();
        // Default: getDocs returns empty for class_types
        mockGetDocs.mockResolvedValue({ docs: [] });
    });

    it('loads a valid term class and exposes it via context', async () => {
        const termClass = makeTermClass();
        mockGetDoc.mockResolvedValue({
            exists: () => true,
            data: () => {
                const { id, ...rest } = termClass;
                return rest;
            },
        });

        render(
            <TermBookingProvider classId="class-1">
                <TestConsumer />
            </TermBookingProvider>
        );

        // Initially loading
        expect(screen.getByTestId('loading').textContent).toBe('true');

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(screen.getByTestId('classId').textContent).toBe('class-1');
        expect(screen.getByTestId('termClassName').textContent).toBe('Cooking Term');
        expect(mockReplace).not.toHaveBeenCalled();
    });

    it('redirects when class is not found', async () => {
        mockGetDoc.mockResolvedValue({
            exists: () => false,
            data: () => null,
        });

        render(
            <TermBookingProvider classId="nonexistent">
                <TestConsumer />
            </TermBookingProvider>
        );

        await waitFor(() => {
            expect(mockReplace).toHaveBeenCalledWith('/classes?error=class_not_found');
        });
    });

    it('redirects when class commitment is not term', async () => {
        const perSessionClass = makeTermClass({ commitment: 'perSession' });
        mockGetDoc.mockResolvedValue({
            exists: () => true,
            data: () => {
                const { id, ...rest } = perSessionClass;
                return rest;
            },
        });

        render(
            <TermBookingProvider classId="class-1">
                <TestConsumer />
            </TermBookingProvider>
        );

        await waitFor(() => {
            expect(mockReplace).toHaveBeenCalledWith('/classes?error=not_term_class');
        });
    });

    it('redirects when spotsAvailable is zero', async () => {
        const fullClass = makeTermClass({ spotsAvailable: 0 });
        mockGetDoc.mockResolvedValue({
            exists: () => true,
            data: () => {
                const { id, ...rest } = fullClass;
                return rest;
            },
        });

        render(
            <TermBookingProvider classId="class-1">
                <TestConsumer />
            </TermBookingProvider>
        );

        await waitFor(() => {
            expect(mockReplace).toHaveBeenCalledWith('/classes?error=class_full');
        });
    });

    it('redirects when term has expired', async () => {
        const expiredClass = makeTermClass({ termEndDate: '2020-01-01' });
        mockGetDoc.mockResolvedValue({
            exists: () => true,
            data: () => {
                const { id, ...rest } = expiredClass;
                return rest;
            },
        });

        render(
            <TermBookingProvider classId="class-1">
                <TestConsumer />
            </TermBookingProvider>
        );

        await waitFor(() => {
            expect(mockReplace).toHaveBeenCalledWith('/classes?error=term_expired');
        });
    });

    it('throws when useTermBooking is used outside provider', () => {
        // Suppress React error boundary logging
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => render(<TestConsumer />)).toThrow(
            'useTermBooking must be used within TermBookingProvider'
        );

        spy.mockRestore();
    });

    it('restores state from sessionStorage on mount', async () => {
        const savedState = {
            classId: 'class-1',
            studentId: 'student-1',
            termsAccepted: true,
        };
        sessionStorage.setItem('booking_term_class-1', JSON.stringify(savedState));

        const termClass = makeTermClass();
        mockGetDoc.mockResolvedValue({
            exists: () => true,
            data: () => {
                const { id, ...rest } = termClass;
                return rest;
            },
        });

        function StateChecker() {
            const { state } = useTermBooking();
            return (
                <div>
                    <span data-testid="studentId">{state.studentId ?? 'none'}</span>
                    <span data-testid="termsAccepted">{String(state.termsAccepted ?? false)}</span>
                </div>
            );
        }

        render(
            <TermBookingProvider classId="class-1">
                <StateChecker />
            </TermBookingProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('studentId').textContent).toBe('student-1');
            expect(screen.getByTestId('termsAccepted').textContent).toBe('true');
        });
    });
});
