import type { Metadata } from 'next';
import { Inter, Nunito } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Blooming Tastebuds — Cooking Classes for Kids & Young Adults',
  description:
    'Discover fun, hands-on cooking classes for children aged 5–12 and young adults. Book your session online today with Blooming Tastebuds.',
  keywords: 'cooking classes, kids cooking, young adults cooking, after school club, Blooming Tastebuds',
  icons: {
    icon: '/blooming_tastebuds_favicon.ico',
    shortcut: '/blooming_tastebuds_favicon.ico',
    apple: '/blooming_tastebuds_favicon.ico',
  },
  openGraph: {
    title: 'Blooming Tastebuds',
    description: 'Fun cooking classes for kids & young adults',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${nunito.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
