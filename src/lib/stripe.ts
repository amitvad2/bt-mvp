import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('STRIPE_SECRET_KEY is not set. Stripe payments will not work.');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2025-03-31.basil' as Stripe.LatestApiVersion,
});

export default stripe;
