'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { GalleryImage } from '@/types';
import { Image as ImageIcon, Plus, Edit2, Trash2, X, Upload, Loader2, AlertCircle } from 'lucide-react';
import styles from './page.module.css';

export default function AdminGallery() {
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingImage, setEditingImage] = useState<GalleryImage | null>(null);
    const [formData, setFormData] = useState({ imageUrl: '', description: '', altText: '', order: 0 });

    // Upload state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        setSelectedFile(null);
        setUploadError(null);
        setUploadProgress(0);
        setShowModal(true);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) { // Increased to 10MB limit
                setUploadError('File is too large. Max size is 10MB.');
                return;
            }
            setSelectedFile(file);
            setUploadError(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);
        setUploadError(null);
        setUploadProgress(0);
        console.info('[GalleryUpload] Starting submit process...');

        try {
            let finalImageUrl = formData.imageUrl;

            // Handle file upload if a new file is selected
            if (selectedFile) {
                console.info('[GalleryUpload] File selected:', selectedFile.name, 'Size:', selectedFile.size);

                const fileExt = selectedFile.name.split('.').pop();
                const fileName = `gallery/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
                const storageRef = ref(storage, fileName);

                console.info('[GalleryUpload] Initiating resumable upload to:', fileName);

                const uploadTask = uploadBytesResumable(storageRef, selectedFile);

                const uploadPromise = new Promise<string>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        console.warn('[GalleryUpload] TIMEOUT REACHED (60s)');
                        uploadTask.cancel();
                        reject(new Error('Upload timed out after 60 seconds. Please check your internet connection or try a smaller file.'));
                    }, 60000);

                    uploadTask.on('state_changed',
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            setUploadProgress(progress);
                            console.info(`[GalleryUpload] Progress: ${progress.toFixed(2)}% (${snapshot.state})`);
                        },
                        (error) => {
                            clearTimeout(timeout);
                            console.error('[GalleryUpload] Storage error code:', error.code, 'Message:', error.message);
                            reject(error);
                        },
                        async () => {
                            clearTimeout(timeout);
                            console.info('[GalleryUpload] Storage upload complete, fetching URL...');
                            try {
                                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                                resolve(downloadURL);
                            } catch (urlErr) {
                                console.error('[GalleryUpload] Error getting download URL:', urlErr);
                                reject(urlErr);
                            }
                        }
                    );
                });

                finalImageUrl = await uploadPromise;
            }

            if (!finalImageUrl) {
                throw new Error('No image URL available. Please upload a photo.');
            }

            const payload = {
                ...formData,
                imageUrl: finalImageUrl,
                updatedAt: serverTimestamp()
            };

            if (editingImage) {
                console.info('[GalleryUpload] Updating Firestore doc:', editingImage.id);
                await updateDoc(doc(db, 'gallery', editingImage.id), payload);
                setImages(prev => prev.map(img => img.id === editingImage.id ? { ...img, ...payload } as GalleryImage : img).sort((a, b) => a.order - b.order));
            } else {
                console.info('[GalleryUpload] Creating new Firestore doc');
                const docRef = await addDoc(collection(db, 'gallery'), { ...payload, createdAt: serverTimestamp() });
                setImages(prev => [...prev, { id: docRef.id, ...payload, createdAt: new Date() } as GalleryImage].sort((a, b) => a.order - b.order));
            }

            console.info('[GalleryUpload] Process finished successfully.');
            setShowModal(false);
        } catch (e: any) {
            console.error('[GalleryUpload] FATAL:', e);
            setUploadError(e.message || 'An unexpected error occurred while saving.');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (img: GalleryImage) => {
        if (!confirm('Are you sure you want to remove this photo from the gallery?')) return;
        try {
            if (img.imageUrl.includes('firebasestorage.googleapis.com')) {
                try {
                    const storageRef = ref(storage, img.imageUrl);
                    await deleteObject(storageRef);
                } catch (se) {
                    console.warn('Storage deletion failed:', se);
                }
            }

            await deleteDoc(doc(db, 'gallery', img.id));
            setImages(prev => prev.filter(i => i.id !== img.id));
        } catch (e) {
            console.error(e);
            alert('Error deleting image.');
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
                                <button className={styles.deleteBtn} onClick={() => handleDelete(img)}><Trash2 size={16} /></button>
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
                                <label className="form-label">Photo <span className="required">*</span></label>

                                <div className={styles.uploadArea} onClick={() => !uploading && fileInputRef.current?.click()}>
                                    {selectedFile ? (
                                        <div className={styles.preview}>
                                            <p>{selectedFile.name}</p>
                                            <span>Click to change</span>
                                        </div>
                                    ) : formData.imageUrl ? (
                                        <div className={styles.preview}>
                                            <img src={formData.imageUrl} alt="Current" className={styles.previewImage} />
                                            <span>Click to replace</span>
                                        </div>
                                    ) : (
                                        <div className={styles.uploadPlaceholder}>
                                            <Upload className={styles.uploadIcon} />
                                            <p>Click to upload image</p>
                                            <span>Max size: 10MB (JPG, PNG)</span>
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        style={{ display: 'none' }}
                                        disabled={uploading}
                                    />
                                </div>

                                {uploading && (
                                    <div className={styles.progressContainer}>
                                        <div
                                            className={styles.progressFill}
                                            style={{ width: `${uploadProgress}%` }}
                                        />
                                        <p className={styles.progressText}>{Math.round(uploadProgress)}% uploaded</p>
                                    </div>
                                )}

                                {uploadError && (
                                    <div className={styles.errorText}>
                                        <AlertCircle size={14} />
                                        {uploadError}
                                    </div>
                                )}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Description (Optional)</label>
                                <input
                                    className="form-input"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="e.g. Making fresh pasta..."
                                    disabled={uploading}
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
                                    disabled={uploading}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Display Order</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.order}
                                    onChange={e => setFormData({ ...formData, order: parseInt(e.target.value) })}
                                    disabled={uploading}
                                />
                            </div>

                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)} disabled={uploading}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={uploading || (!selectedFile && !formData.imageUrl)}>
                                    {uploading ? (
                                        <>
                                            <Loader2 className="spinner-inline" />
                                            {uploadProgress < 100 ? 'Uploading...' : 'Saving...'}
                                        </>
                                    ) : editingImage ? 'Save Changes' : 'Upload to Gallery'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
