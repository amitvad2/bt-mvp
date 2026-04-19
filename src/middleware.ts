/**
 * Edge middleware — UX-layer route protection.
 *
 * This middleware is a convenience fence, NOT a security boundary.
 * It redirects unauthenticated users away from protected routes based on the
 * presence of the `bt_session` cookie, which is a plain boolean set by
 * AuthContext. Edge middleware cannot call the Firebase Admin SDK to verify
 * ID tokens, so the cookie is trusted without cryptographic verification.
 *
 * Real security is enforced by Firestore security rules and server-side
 * API route guards (adminInitError checks, etc.).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// /portal is intentionally absent — it is guarded client-side by PortalLayout,
// which can read btUser.role. Middleware cannot distinguish roles from the cookie.
const protectedRoutes = ['/book', '/admin'];

// Routes that redirect authenticated users to the dashboard (no re-login needed).
const authRoutes = ['/auth/login', '/auth/signup', '/auth/forgot-password'];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const sessionCookie = request.cookies.get('bt_session')?.value;
    const isAuthenticated = !!sessionCookie;

    // Send authenticated users away from login/signup pages.
    if (authRoutes.some((route) => pathname.startsWith(route))) {
        if (isAuthenticated) {
            return NextResponse.redirect(new URL('/portal/dashboard', request.url));
        }
        return NextResponse.next();
    }

    // Redirect unauthenticated users to login, preserving the intended destination.
    if (protectedRoutes.some((route) => pathname.startsWith(route))) {
        if (!isAuthenticated) {
            const loginUrl = new URL('/auth/login', request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/book/:path*',
        '/admin/:path*',
        '/auth/:path*',
    ],
};
