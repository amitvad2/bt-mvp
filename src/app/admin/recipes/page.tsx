'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { Recipe } from '@/types';
import { BookOpen, Plus, Edit2, Trash2, X, Upload, Loader2, AlertCircle } from 'lucide-react';
import styles from './page.module.css';

export default function AdminRecipes() {
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
    const [formData, setFormData] = useState({ name: '', description: '', photoUrl: '' });

    // Upload state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchRecipes = async () => {
            try {
                const snap = await getDocs(query(collection(db, 'recipes'), orderBy('name', 'asc')));
                setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe)));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchRecipes();
    }, []);

    const handleOpenModal = (recipe?: Recipe) => {
        if (recipe) {
            setEditingRecipe(recipe);
            setFormData({ name: recipe.name, description: recipe.description, photoUrl: recipe.photoUrl || '' });
        } else {
            setEditingRecipe(null);
            setFormData({ name: '', description: '', photoUrl: '' });
        }
        setSelectedFile(null);
        setUploadError(null);
        setUploadProgress(0);
        setShowModal(true);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
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
        console.info('[RecipeUpload] Starting submit process...');

        try {
            let finalPhotoUrl = formData.photoUrl;

            // Handle file upload if a new file is selected
            if (selectedFile) {
                console.info('[RecipeUpload] File selected:', selectedFile.name, 'Size:', selectedFile.size);

                const fileExt = selectedFile.name.split('.').pop();
                const fileName = `recipes/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
                const storageRef = ref(storage, fileName);

                console.info('[RecipeUpload] Initiating resumable upload to:', fileName);

                const uploadTask = uploadBytesResumable(storageRef, selectedFile);

                const uploadPromise = new Promise<string>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        console.warn('[RecipeUpload] TIMEOUT REACHED (60s)');
                        uploadTask.cancel();
                        reject(new Error('Upload timed out after 60 seconds. Please check your internet connection or try a smaller file.'));
                    }, 60000);

                    uploadTask.on('state_changed',
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            setUploadProgress(progress);
                            console.info(`[RecipeUpload] Progress: ${progress.toFixed(2)}% (${snapshot.state})`);
                        },
                        (error) => {
                            clearTimeout(timeout);
                            console.error('[RecipeUpload] Storage error code:', error.code, 'Message:', error.message);
                            reject(error);
                        },
                        async () => {
                            clearTimeout(timeout);
                            console.info('[RecipeUpload] Storage upload complete, fetching URL...');
                            try {
                                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                                resolve(downloadURL);
                            } catch (urlErr) {
                                console.error('[RecipeUpload] Error getting download URL:', urlErr);
                                reject(urlErr);
                            }
                        }
                    );
                });

                finalPhotoUrl = await uploadPromise;
            }

            const payload = {
                ...formData,
                photoUrl: finalPhotoUrl,
                updatedAt: serverTimestamp()
            };

            if (editingRecipe) {
                console.info('[RecipeUpload] Updating Firestore doc:', editingRecipe.id);
                await updateDoc(doc(db, 'recipes', editingRecipe.id), payload);
                setRecipes(prev => prev.map(r => r.id === editingRecipe.id ? { ...r, ...payload } as Recipe : r));
            } else {
                console.info('[RecipeUpload] Creating new Firestore doc');
                const docRef = await addDoc(collection(db, 'recipes'), { ...payload, createdAt: serverTimestamp() });
                setRecipes(prev => [...prev, { id: docRef.id, ...payload, createdAt: new Date() } as Recipe].sort((a, b) => a.name.localeCompare(b.name)));
            }

            console.info('[RecipeUpload] Process finished successfully.');
            setShowModal(false);
        } catch (e: any) {
            console.error('[RecipeUpload] FATAL:', e);
            setUploadError(e.message || 'An unexpected error occurred while saving.');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (recipe: Recipe) => {
        if (!confirm('Are you sure you want to delete this recipe?')) return;
        try {
            // 1. Delete photo from Storage if it's a Firebase URL
            if (recipe.photoUrl && recipe.photoUrl.includes('firebasestorage.googleapis.com')) {
                try {
                    const storageRef = ref(storage, recipe.photoUrl);
                    await deleteObject(storageRef);
                } catch (se) {
                    console.warn('Storage deletion failed or file already gone:', se);
                }
            }

            // 2. Delete from Firestore
            await deleteDoc(doc(db, 'recipes', recipe.id));
            setRecipes(prev => prev.filter(r => r.id !== recipe.id));
        } catch (e) {
            console.error(e);
            alert('Error deleting recipe.');
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>Recipe Master</h1>
                    <p>Create and manage recipes that can be linked to sessions.</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    <Plus size={18} /> Add Recipe
                </button>
            </div>

            {loading ? (
                <div className="spinner" />
            ) : (
                <div className={styles.grid}>
                    {recipes.map(recipe => (
                        <div key={recipe.id} className={`card ${styles.recipeCard}`}>
                            <div className={styles.recipeImage}>
                                {recipe.photoUrl ? (
                                    <img src={recipe.photoUrl} alt={recipe.name} />
                                ) : (
                                    <div className={styles.placeholder}>
                                        <BookOpen size={24} strokeWidth={1.5} />
                                    </div>
                                )}
                            </div>
                            <div className={styles.recipeContent}>
                                <h3>{recipe.name}</h3>
                                <p className={styles.description}>{recipe.description}</p>
                                <div className={styles.actions}>
                                    <div className="flex gap-2">
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(recipe)}>
                                            <Edit2 size={16} strokeWidth={1.5} />
                                        </button>
                                        <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(recipe)}>
                                            <Trash2 size={16} strokeWidth={1.5} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {recipes.length === 0 && <p className={styles.empty}>No recipes found. Add your first recipe!</p>}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">{editingRecipe ? 'Edit Recipe' : 'Add New Recipe'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className="form-group">
                                <label className="form-label">Recipe Name <span className="required">*</span></label>
                                <input
                                    className="form-input"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. Handmade Pasta"
                                    disabled={uploading}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Photo (Optional)</label>
                                <div className={styles.uploadArea} onClick={() => !uploading && fileInputRef.current?.click()}>
                                    {selectedFile ? (
                                        <div className={styles.preview}>
                                            <p>{selectedFile.name}</p>
                                            <span>Click to change</span>
                                        </div>
                                    ) : formData.photoUrl ? (
                                        <div className={styles.preview}>
                                            <img src={formData.photoUrl} alt="Current" className={styles.previewImage} />
                                            <span>Click to replace</span>
                                        </div>
                                    ) : (
                                        <div className={styles.uploadPlaceholder}>
                                            <Upload className={styles.uploadIcon} />
                                            <p>Click to upload photo</p>
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
                                <label className="form-label">Description <span className="required">*</span></label>
                                <textarea
                                    className="form-input"
                                    required
                                    rows={4}
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Tell students about the dish..."
                                    disabled={uploading}
                                />
                            </div>

                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)} disabled={uploading}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={uploading}>
                                    {uploading ? (
                                        <>
                                            <Loader2 className="spinner-inline" />
                                            {uploadProgress < 100 ? 'Uploading...' : 'Saving...'}
                                        </>
                                    ) : editingRecipe ? 'Save Changes' : 'Save Recipe'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
