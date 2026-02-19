'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GalleryImage } from '@/types';
import { Image as ImageIcon, Plus, Edit2, Trash2, X, MoveUp, MoveDown } from 'lucide-react';
import styles from './page.module.css';

export default function AdminGallery() {
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingImage, setEditingImage] = useState<GalleryImage | null>(null);
    const [formData, setFormData] = useState({ imageUrl: '', description: '', altText: '', order: 0 });

    useEffect(() => {
        const fetchImages = async () => {
            try {
                const snap = await getDocs(query(collection(db, 'gallery'), orderBy('order', 'asc')));
                setImages(snap.docs.map(d => ({ id: d.id, ...d.data() } as GalleryImage)));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchImages();
    }, []);

    const handleOpenModal = (img?: GalleryImage) => {
        if (img) {
            setEditingImage(img);
            setFormData({
                imageUrl: img.imageUrl,
                description: img.description || '',
                altText: img.altText || '',
                order: img.order || 0
            });
        } else {
            setEditingImage(null);
            setFormData({ imageUrl: '', description: '', altText: '', order: images.length });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingImage) {
                await updateDoc(doc(db, 'gallery', editingImage.id), { ...formData, updatedAt: serverTimestamp() });
                setImages(prev => prev.map(img => img.id === editingImage.id ? { ...img, ...formData } : img).sort((a, b) => a.order - b.order));
            } else {
                const docRef = await addDoc(collection(db, 'gallery'), { ...formData, createdAt: serverTimestamp() });
                setImages(prev => [...prev, { id: docRef.id, ...formData } as GalleryImage].sort((a, b) => a.order - b.order));
            }
            setShowModal(false);
        } catch (e) {
            console.error(e);
            alert('Error saving gallery item.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to remove this photo from the gallery?')) return;
        try {
            await deleteDoc(doc(db, 'gallery', id));
            setImages(prev => prev.filter(img => img.id !== id));
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>Gallery Master</h1>
                    <p>Manage the photos displayed on the public gallery page.</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    <Plus size={18} /> Add Photo
                </button>
            </div>

            {loading ? (
                <div className="spinner" />
            ) : (
                <div className={styles.grid}>
                    {images.map(img => (
                        <div key={img.id} className={styles.galleryItem}>
                            <div className={styles.imageOverlay}>
                                <button className={styles.deleteBtn} onClick={() => handleDelete(img.id)}><Trash2 size={16} /></button>
                                <button className={styles.editBtn} onClick={() => handleOpenModal(img)}><Edit2 size={16} /></button>
                            </div>
                            <img src={img.imageUrl} alt={img.altText} className={styles.image} />
                            <div className={styles.itemMeta}>
                                <span className={styles.orderBadge}>#{img.order}</span>
                                <p>{img.description || 'No description'}</p>
                            </div>
                        </div>
                    ))}
                    {images.length === 0 && <p className={styles.empty}>Gallery is empty. Upload some food magic!</p>}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">{editingImage ? 'Edit Photo Details' : 'Add New Photo'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className="form-group">
                                <label className="form-label">Image URL <span className="required">*</span></label>
                                <input
                                    className="form-input"
                                    required
                                    value={formData.imageUrl}
                                    onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                                    placeholder="https://..."
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Description (Optional)</label>
                                <input
                                    className="form-input"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="e.g. Making fresh pasta..."
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Alt Text (Critical for SEO) <span className="required">*</span></label>
                                <input
                                    className="form-input"
                                    required
                                    value={formData.altText}
                                    onChange={e => setFormData({ ...formData, altText: e.target.value })}
                                    placeholder="e.g. Children kneading dough in a sunlit kitchen"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Display Order</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.order}
                                    onChange={e => setFormData({ ...formData, order: parseInt(e.target.value) })}
                                />
                            </div>
                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save to Gallery</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
