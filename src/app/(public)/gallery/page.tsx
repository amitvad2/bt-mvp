import type { Metadata } from 'next';
import GalleryClient from './GalleryClient';

export const metadata: Metadata = {
    title: 'Gallery | Blooming Tastebuds',
    description: 'Take a look at what we’ve been cooking! Photos from our latest kids and young adult cooking sessions.',
};

export default function GalleryPage() {
    return <GalleryClient />;
}
