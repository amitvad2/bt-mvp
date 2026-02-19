'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Recipe } from '@/types';
import { BookOpen, Plus, Edit2, Trash2, X, Image as ImageIcon } from 'lucide-react';
import styles from './page.module.css';

export default function AdminRecipes() {
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
    const [formData, setFormData] = useState({ name: '', description: '', photoUrl: '' });

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
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingRecipe) {
                await updateDoc(doc(db, 'recipes', editingRecipe.id), { ...formData, updatedAt: serverTimestamp() });
                setRecipes(prev => prev.map(r => r.id === editingRecipe.id ? { ...r, ...formData } : r));
            } else {
                const docRef = await addDoc(collection(db, 'recipes'), { ...formData, createdAt: serverTimestamp() });
                setRecipes(prev => [...prev, { id: docRef.id, ...formData } as Recipe].sort((a, b) => a.name.localeCompare(b.name)));
            }
            setShowModal(false);
        } catch (e) {
            console.error(e);
            alert('Error saving recipe.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this recipe?')) return;
        try {
            await deleteDoc(doc(db, 'recipes', id));
            setRecipes(prev => prev.filter(r => r.id !== id));
        } catch (e) {
            console.error(e);
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
                                        <BookOpen size={24} />
                                    </div>
                                )}
                            </div>
                            <div className={styles.recipeContent}>
                                <h3>{recipe.name}</h3>
                                <p className={styles.description}>{recipe.description}</p>
                                <div className={styles.actions}>
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(recipe)}>
                                        <Edit2 size={16} /> Edit
                                    </button>
                                    <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(recipe.id)}>
                                        <Trash2 size={16} /> Delete
                                    </button>
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
                                />
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
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Photo URL (Optional)</label>
                                <input
                                    className="form-input"
                                    value={formData.photoUrl}
                                    onChange={e => setFormData({ ...formData, photoUrl: e.target.value })}
                                    placeholder="https://images.unsplash.com/..."
                                />
                            </div>
                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Recipe</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
