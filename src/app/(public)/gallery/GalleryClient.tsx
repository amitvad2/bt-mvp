'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GalleryImage, GalleryCategoryDoc } from '@/types';
import { fetchCategories, normalizeCategory } from '@/lib/gallery-categories';
import styles from './page.module.css';

export default function GalleryClient() {
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [categories, setCategories] = useState<GalleryCategoryDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [categoriesError, setCategoriesError] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string>('all');

    useEffect(() => {
        const loadData = async () => {
            try {
                // Fetch images
                const q = query(collection(db, 'gallery'), orderBy('order', 'asc'));
                const snap = await getDocs(q);
                setImages(snap.docs.map(d => ({ id: d.id, ...d.data() } as GalleryImage)));
            } catch (e) {
                console.error('Error fetching gallery:', e);
            }

            try {
                // Fetch visible categories
                const cats = await fetchCategories({ visibleOnly: true });
                setCategories(cats);
            } catch (e) {
                console.error('Error fetching categories:', e);
                setCategoriesError(true);
            }

            setLoading(false);
        };
        loadData();
    }, []);

    // Build valid slugs from fetched categories
    const validSlugs = useMemo(
        () => new Set(categories.map(c => c.slug)),
        [categories]
    );

    // Determine whether to show tabs
    const showTabs = categories.length > 0 && !categoriesError;

    // Filter images based on active category
    const filteredImages = useMemo(() => {
        if (!showTabs || activeCategory === 'all') {
            // "All Photos": show images belonging to any visible category
            if (!showTabs) return images;
            return images.filter(img => validSlugs.has(normalizeCategory(img.category, validSlugs)));
        }
        // Specific category: show images matching the selected slug
        return images.filter(img => normalizeCategory(img.category, validSlugs) === activeCategory);
    }, [images, activeCategory, validSlugs, showTabs]);

    if (loading) return <div className="spinner" />;

    return (
        <section className={`section ${styles.gallerySection}`}>
            <div className="container">
                <div className="section-header">
                    <span className="eyebrow">Visual Journey</span>
                    <h2>Cooking in Action</h2>
                    <p>
                        Photos from our cooking classes and a showcase of the founder&apos;s own bakes
                        and creations.
                    </p>
                </div>

                {categoriesError && (
                    <p className={styles.errorBanner}>
                        Could not load categories. Showing all photos.
                    </p>
                )}

                {showTabs && (
                    <div className={styles.categoryNavigation}>
                        <div className={styles.tabGroup}>
                            <button
                                className={`${styles.tabButton} ${activeCategory === 'all' ? styles.activeTab : ''}`}
                                onClick={() => setActiveCategory('all')}
                            >
                                All Photos
                            </button>
                            {categories.map(category => (
                                <button
                                    key={category.slug}
                                    className={`${styles.tabButton} ${activeCategory === category.slug ? styles.activeTab : ''}`}
                                    onClick={() => setActiveCategory(category.slug)}
                                >
                                    {category.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

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
                            <p>No photos found in this category yet — check back soon!</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
