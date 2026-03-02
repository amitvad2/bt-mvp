'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GalleryImage, GalleryCategory } from '@/types';
import styles from './page.module.css';

const CATEGORIES: { value: GalleryCategory | 'all', label: string }[] = [
    { value: 'all', label: 'All Photos' },
    { value: 'cooking-classes', label: 'Cooking Classes' },
    { value: 'cakes', label: 'Cakes' },
    { value: 'cookies', label: 'Cookies' },
    { value: 'breads', label: 'Breads' }
];

export default function GalleryClient() {
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<GalleryCategory | 'all'>('all');

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

    const filteredImages = activeCategory === 'all'
        ? images
        : images.filter(img => (img.category || 'cooking-classes') === activeCategory);

    return (
        <section className={`section ${styles.gallerySection}`}>
            <div className="container">
                <div className="section-header">
                    <span className="eyebrow">Visual Journey</span>
                    <h2>Cooking in Action</h2>
                    <p>Capturing the smiles, the skills, and the snacks from our recent sessions.</p>
                </div>

                <div className={styles.categoryNavigation}>
                    <div className={styles.tabGroup}>
                        {CATEGORIES.map(category => (
                            <button
                                key={category.value}
                                className={`${styles.tabButton} ${activeCategory === category.value ? styles.activeTab : ''}`}
                                onClick={() => setActiveCategory(category.value)}
                            >
                                {category.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={styles.grid}>
                    {filteredImages.map((img) => (
                        <div key={img.id} className={styles.imageCard}>
                            <div className={styles.imageWrapper}>
                                <img src={img.imageUrl} alt={img.altText} loading="lazy" />
                            </div>
                            {img.description && <p className={styles.caption}>{img.description}</p>}
                        </div>
                    ))}
                    {filteredImages.length === 0 && (
                        <div className={styles.empty}>
                            <p>No photos found for this category yet. Check back soon!</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
