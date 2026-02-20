'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GalleryImage } from '@/types';
import styles from './page.module.css';

export default function GalleryClient() {
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchImages = async () => {
            try {
                const q = query(collection(db, 'gallery'), orderBy('order', 'asc'));
                const snap = await getDocs(q);
                setImages(snap.docs.map(d => ({ id: d.id, ...d.data() } as GalleryImage)));
            } catch (e) {
                console.error('Error fetching gallery:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchImages();
    }, []);

    if (loading) return <div className="spinner" />;

    return (
        <section className={`section ${styles.gallerySection}`}>
            <div className="container">
                <div className="section-header">
                    <span className="eyebrow">Visual Journey</span>
                    <h2>Cooking in Action</h2>
                    <p>Capturing the smiles, the skills, and the snacks from our recent sessions.</p>
                </div>

                <div className={styles.grid}>
                    {images.map((img) => (
                        <div key={img.id} className={styles.imageCard}>
                            <div className={styles.imageWrapper}>
                                <img src={img.imageUrl} alt={img.altText} loading="lazy" />
                            </div>
                            {img.description && <p className={styles.caption}>{img.description}</p>}
                        </div>
                    ))}
                    {images.length === 0 && (
                        <div className={styles.empty}>
                            <p>Our gallery is currently empty. Check back soon for photos from our sessions!</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
