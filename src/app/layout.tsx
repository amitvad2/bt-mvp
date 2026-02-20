import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

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
    <html lang="en">
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
