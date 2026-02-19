import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/firebase-admin';

export async function POST(req: Request) {
    try {
        const { sessionId, studentId, amount, metadata } = await req.json();

        if (!sessionId || !amount) {
            return NextResponse.json({ error: 'Missing sessionId or amount' }, { status: 400 });
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

        return NextResponse.json({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (error: any) {
        console.error('Stripe error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
