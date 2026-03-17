import { NextResponse } from 'next/server';
import stripe from '@/lib/stripe';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { sessionId, studentId, amount, metadata } = body;
        console.log('[create-intent] Received request:', { sessionId, amount, hasKey: !!process.env.STRIPE_SECRET_KEY });

        if (!sessionId || !amount) {
            console.error('[create-intent] Validation failed: Missing sessionId or amount');
            return NextResponse.json({ error: 'Missing sessionId or amount' }, { status: 400 });
        }

        if (!process.env.STRIPE_SECRET_KEY) {
            console.error('[create-intent] STRIPE_SECRET_KEY is not configured');
            return NextResponse.json({ error: 'Payment service is not configured. Please contact support.' }, { status: 500 });
        }

        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: 'gbp',
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                sessionId,
                studentId: studentId || 'self',
                ...metadata
            },
        });

        console.log('[create-intent] PaymentIntent created:', paymentIntent.id);

        return NextResponse.json({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (error: any) {
        console.error('[create-intent] Error:', error?.type, error?.message);
        return NextResponse.json(
            { error: error.message || 'Failed to create payment intent' },
            { status: 500 }
        );
    }
}
