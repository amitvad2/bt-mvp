import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const protectedRoutes = ['/portal', '/book', '/admin'];
// Routes that require admin role (checked client-side too)
const adminRoutes = ['/admin'];
// Routes that redirect to dashboard if already logged in
const authRoutes = ['/auth/login', '/auth/signup', '/auth/forgot-password'];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Check for Firebase auth session cookie
    const sessionCookie = request.cookies.get('session')?.value;
    const isAuthenticated = !!sessionCookie;

    // Redirect authenticated users away from auth pages
    if (authRoutes.some((route) => pathname.startsWith(route))) {
        if (isAuthenticated) {
            return NextResponse.redirect(new URL('/portal/dashboard', request.url));
        }
        return NextResponse.next();
    }

    // Protect portal, book, and admin routes
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
        '/portal/:path*',
        '/book/:path*',
        '/admin/:path*',
        '/auth/:path*',
    ],
};
