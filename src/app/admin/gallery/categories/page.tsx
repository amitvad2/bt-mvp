'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchCategories } from '@/lib/gallery-categories';
import { GalleryCategoryDoc } from '@/types';
import { ChevronUp, ChevronDown, Trash2, Eye, EyeOff, Plus, Pencil } from 'lucide-react';
import styles from './page.module.css';

export default function CategoryManagerPage() {
    const { user } = useAuth();

    const [categories, setCategories] = useState<GalleryCategoryDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [createError, setCreateError] = useState<string | null>(null);
    const [editError, setEditError] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; imageCount: number } | null>(null);

    const editInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadCategories();
    }, []);

    useEffect(() => {
        if (editingId && editInputRef.current) {
            editInputRef.current.focus();
        }
    }, [editingId]);

    async function loadCategories() {
        try {
            const cats = await fetchCategories();
            setCategories(cats);
            setError(null);
        } catch {
            setError('Failed to load categories.');
        } finally {
            setLoading(false);
        }
    }

    async function getToken(): Promise<string | null> {
        if (!user) return null;
        try {
            return await user.getIdToken();
        } catch {
            setError('Authentication error. Please refresh the page.');
            return null;
        }
    }

    // ── Create ───────────────────────────────────────────────────────────────
    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setCreateError(null);

        const trimmed = newLabel.trim();
        if (!trimmed) {
            setCreateError('Label must not be empty');
            return;
        }
        if (trimmed.length > 50) {
            setCreateError('Label must be 50 characters or fewer');
            return;
        }

        const token = await getToken();
        if (!token) return;

        try {
            const res = await fetch('/api/gallery-categories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ action: 'create', label: trimmed }),
            });

            const data = await res.json();

            if (!res.ok) {
                setCreateError(data.error || 'Failed to create category');
                return;
            }

            // Add to list
            setCategories(prev => [...prev, {
                id: data.id,
                slug: data.slug,
                label: data.label,
                order: data.order,
                isVisible: data.isVisible,
                createdAt: null,
            }]);
            setNewLabel('');
        } catch {
            setCreateError('Network error. Please try again.');
        }
    }

    // ── Edit (inline) ────────────────────────────────────────────────────────
    function startEdit(cat: GalleryCategoryDoc) {
        setEditingId(cat.id);
        setEditLabel(cat.label);
        setEditError(null);
    }

    async function saveEdit() {
        if (!editingId) return;
        setEditError(null);

        const trimmed = editLabel.trim();
        if (!trimmed) {
            setEditError('Label must not be empty');
            return;
        }
        if (trimmed.length > 50) {
            setEditError('Label must be 50 characters or fewer');
            return;
        }

        // If unchanged, just close
        const current = categories.find(c => c.id === editingId);
        if (current && current.label === trimmed) {
            setEditingId(null);
            return;
        }

        const token = await getToken();
        if (!token) return;

        try {
            const res = await fetch('/api/gallery-categories', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ action: 'update', id: editingId, label: trimmed }),
            });

            const data = await res.json();

            if (!res.ok) {
                setEditError(data.error || 'Failed to update category');
                return;
            }

            setCategories(prev => prev.map(c =>
                c.id === editingId ? { ...c, label: data.label } : c
            ));
            setEditingId(null);
        } catch {
            setEditError('Network error. Please try again.');
        }
    }

    function handleEditKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            setEditingId(null);
            setEditError(null);
        }
    }

    // ── Visibility toggle ────────────────────────────────────────────────────
    async function toggleVisibility(cat: GalleryCategoryDoc) {
        const token = await getToken();
        if (!token) return;

        // Optimistic
        const newVisibility = !cat.isVisible;
        setCategories(prev => prev.map(c =>
            c.id === cat.id ? { ...c, isVisible: newVisibility } : c
        ));

        try {
            const res = await fetch('/api/gallery-categories', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ action: 'update', id: cat.id, isVisible: newVisibility }),
            });

            if (!res.ok) {
                // Rollback
                setCategories(prev => prev.map(c =>
                    c.id === cat.id ? { ...c, isVisible: cat.isVisible } : c
                ));
                setError('Failed to update visibility');
            }
        } catch {
            // Rollback
            setCategories(prev => prev.map(c =>
                c.id === cat.id ? { ...c, isVisible: cat.isVisible } : c
            ));
            setError('Network error. Please try again.');
        }
    }

    // ── Reorder ──────────────────────────────────────────────────────────────
    async function handleReorder(cat: GalleryCategoryDoc, direction: 'up' | 'down') {
        const currentIndex = categories.findIndex(c => c.id === cat.id);
        if (direction === 'up' && currentIndex === 0) return;
        if (direction === 'down' && currentIndex === categories.length - 1) return;

        // Optimistic UI — swap locally
        const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        const newCategories = [...categories];
        const tempOrder = newCategories[currentIndex].order;
        newCategories[currentIndex] = { ...newCategories[currentIndex], order: newCategories[swapIndex].order };
        newCategories[swapIndex] = { ...newCategories[swapIndex], order: tempOrder };
        newCategories.sort((a, b) => a.order - b.order);

        const previousCategories = categories;
        setCategories(newCategories);

        const token = await getToken();
        if (!token) {
            setCategories(previousCategories);
            return;
        }

        try {
            const res = await fetch('/api/gallery-categories', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ action: 'reorder', id: cat.id, direction }),
            });

            if (!res.ok) {
                setCategories(previousCategories);
                setError('Failed to reorder category');
            }
        } catch {
            setCategories(previousCategories);
            setError('Network error. Please try again.');
        }
    }

    // ── Delete ───────────────────────────────────────────────────────────────
    async function handleDeleteRequest(cat: GalleryCategoryDoc) {
        if (categories.length <= 1) {
            setError('At least one category must exist');
            return;
        }

        const token = await getToken();
        if (!token) return;

        try {
            const res = await fetch('/api/gallery-categories', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ action: 'delete', id: cat.id }),
            });

            const data = await res.json();

            if (res.status === 409 && data.imageCount) {
                // Images exist — show confirmation dialog
                setDeleteConfirm({ id: cat.id, imageCount: data.imageCount });
                return;
            }

            if (!res.ok) {
                setError(data.error || 'Failed to delete category');
                return;
            }

            // Successful delete with no images
            setCategories(prev => {
                const remaining = prev.filter(c => c.id !== cat.id);
                // Re-number order locally
                return remaining.map((c, i) => ({ ...c, order: i + 1 }));
            });
        } catch {
            setError('Network error. Please try again.');
        }
    }

    async function confirmDelete() {
        if (!deleteConfirm) return;

        const token = await getToken();
        if (!token) return;

        try {
            const res = await fetch('/api/gallery-categories', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ action: 'delete', id: deleteConfirm.id, confirmed: true }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to delete category');
                setDeleteConfirm(null);
                return;
            }

            setCategories(prev => {
                const remaining = prev.filter(c => c.id !== deleteConfirm.id);
                return remaining.map((c, i) => ({ ...c, order: i + 1 }));
            });
            setDeleteConfirm(null);
        } catch {
            setError('Network error. Please try again.');
            setDeleteConfirm(null);
        }
    }

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className={styles.page}>
            <h1>Category Manager</h1>

            {error && (
                <div className={`alert alert-error ${styles.errorBanner}`} role="alert">
                    {error}
                    <button
                        className={styles.dismissBtn}
                        onClick={() => setError(null)}
                        aria-label="Dismiss error"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Create Form */}
            <form className={styles.createForm} onSubmit={handleCreate}>
                <div className={styles.createInputGroup}>
                    <label htmlFor="new-category-label" className={styles.srOnly}>
                        New category label
                    </label>
                    <input
                        id="new-category-label"
                        type="text"
                        className="form-input"
                        placeholder="New category name"
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                        maxLength={50}
                    />
                    <button type="submit" className="btn btn-primary" disabled={!newLabel.trim()}>
                        <Plus size={16} /> Add Category
                    </button>
                </div>
                {createError && (
                    <p className={styles.validationError} role="alert">{createError}</p>
                )}
            </form>

            {/* Category List */}
            {loading ? (
                <div className="spinner" />
            ) : categories.length === 0 ? (
                <p className={styles.empty}>No categories yet. Add one above.</p>
            ) : (
                <ol className={styles.categoryList}>
                    {categories.map((cat, index) => (
                        <li key={cat.id} className={styles.categoryItem}>
                            <span className={styles.orderNumber}>{cat.order}</span>

                            {editingId === cat.id ? (
                                <div className={styles.editGroup}>
                                    <input
                                        ref={editInputRef}
                                        type="text"
                                        className={`form-input ${styles.editInput}`}
                                        value={editLabel}
                                        onChange={e => setEditLabel(e.target.value)}
                                        onBlur={saveEdit}
                                        onKeyDown={handleEditKeyDown}
                                        maxLength={50}
                                        aria-label="Edit category label"
                                    />
                                    {editError && (
                                        <p className={styles.validationError} role="alert">{editError}</p>
                                    )}
                                </div>
                            ) : (
                                <button
                                    className={styles.labelBtn}
                                    onClick={() => startEdit(cat)}
                                    title="Click to edit"
                                >
                                    <span className={styles.label}>{cat.label}</span>
                                    <Pencil size={14} className={styles.editIcon} />
                                </button>
                            )}

                            <div className={styles.actions}>
                                <button
                                    className={styles.iconBtn}
                                    onClick={() => toggleVisibility(cat)}
                                    aria-label={cat.isVisible ? `Hide ${cat.label}` : `Show ${cat.label}`}
                                    title={cat.isVisible ? 'Visible — click to hide' : 'Hidden — click to show'}
                                >
                                    {cat.isVisible ? <Eye size={18} /> : <EyeOff size={18} />}
                                </button>

                                <button
                                    className={styles.iconBtn}
                                    onClick={() => handleReorder(cat, 'up')}
                                    disabled={index === 0}
                                    aria-label={`Move ${cat.label} up`}
                                >
                                    <ChevronUp size={18} />
                                </button>

                                <button
                                    className={styles.iconBtn}
                                    onClick={() => handleReorder(cat, 'down')}
                                    disabled={index === categories.length - 1}
                                    aria-label={`Move ${cat.label} down`}
                                >
                                    <ChevronDown size={18} />
                                </button>

                                <button
                                    className={`${styles.iconBtn} ${styles.deleteBtn}`}
                                    onClick={() => handleDeleteRequest(cat)}
                                    aria-label={`Delete ${cat.label}`}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </li>
                    ))}
                </ol>
            )}

            {/* Delete Confirmation Dialog */}
            {deleteConfirm && (
                <div className={styles.dialogOverlay}>
                    <div className={styles.dialog} role="alertdialog" aria-labelledby="delete-dialog-title">
                        <h2 id="delete-dialog-title" className={styles.dialogTitle}>Confirm Deletion</h2>
                        <p className={styles.dialogBody}>
                            This category has <strong>{deleteConfirm.imageCount}</strong> image{deleteConfirm.imageCount !== 1 ? 's' : ''} assigned. They will be reassigned to the first remaining category. Continue?
                        </p>
                        <div className={styles.dialogActions}>
                            <button
                                className="btn btn-ghost"
                                onClick={() => setDeleteConfirm(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={confirmDelete}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
