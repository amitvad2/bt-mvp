import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/context/AuthContext', () => ({
    useAuth: vi.fn(() => ({ user: null })),
}));

vi.mock('next/link', () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import ContactForm from '@/app/(public)/contact/ContactForm';

const fillValidForm = async () => {
    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane Smith');
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@example.com');
    await userEvent.selectOptions(screen.getByLabelText(/enquiry type/i), 'general');
    await userEvent.type(screen.getByLabelText(/message/i), 'Hello, I have a question about your classes.');
    await userEvent.click(screen.getByRole('checkbox'));
};

describe('ContactForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn());
    });

    it('renders all form fields', () => {
        render(<ContactForm />);
        expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/enquiry type/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
        expect(screen.getByRole('checkbox')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
    });

    it('shows instructional heading and intro copy before submission', () => {
        render(<ContactForm />);
        expect(screen.getByRole('heading', { name: /send a message/i })).toBeInTheDocument();
        expect(screen.getByText(/fill in the form below/i)).toBeInTheDocument();
    });

    it('replaces instructional copy with success copy after successful submission', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(JSON.stringify({ success: true, id: 'msg-1' }), { status: 200 })
        );
        render(<ContactForm />);
        await fillValidForm();
        await userEvent.click(screen.getByRole('button', { name: /send message/i }));

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /message sent/i })).toBeInTheDocument();
        });
        expect(screen.getByText(/your message has been sent/i)).toBeInTheDocument();
        expect(screen.queryByText(/fill in the form below/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument();
    });

    it('shows error state after failed submission', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(JSON.stringify({ error: 'Service unavailable' }), { status: 500 })
        );
        render(<ContactForm />);
        await fillValidForm();
        await userEvent.click(screen.getByRole('button', { name: /send message/i }));

        await waitFor(() => {
            expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
        });
        // Form remains visible
        expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
    });

    it('disables submit button while submitting', async () => {
        let resolveResponse: (v: Response) => void;
        const pendingFetch = new Promise<Response>(r => { resolveResponse = r; });
        vi.mocked(fetch).mockReturnValueOnce(pendingFetch);

        render(<ContactForm />);
        await fillValidForm();
        await userEvent.click(screen.getByRole('button', { name: /send message/i }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
        });

        resolveResponse!(new Response(JSON.stringify({ success: true }), { status: 200 }));
    });

    it('shows inline validation errors for missing required fields', async () => {
        render(<ContactForm />);
        await userEvent.click(screen.getByRole('button', { name: /send message/i }));
        await waitFor(() => {
            expect(screen.getByText(/name is required/i)).toBeInTheDocument();
        });
    });
});
