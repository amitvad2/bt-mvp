'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Recipe, ScheduleEntry } from '@/types';
import { insertDate, getActiveSessionCount } from '@/lib/term-schedule-utils';
import { ChefHat, X, SkipForward, Plus, Calendar } from 'lucide-react';
import styles from './TermScheduleEditor.module.css';

interface TermScheduleEditorProps {
  sessionId: string;
  schedule: ScheduleEntry[];
  onScheduleChange?: (schedule: ScheduleEntry[]) => void;
}

export default function TermScheduleEditor({
  sessionId,
  schedule,
  onScheduleChange,
}: TermScheduleEditorProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [localSchedule, setLocalSchedule] = useState<ScheduleEntry[]>(schedule);
  const [makeUpDate, setMakeUpDate] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchRecipes = async () => {
      try {
        const snap = await getDocs(collection(db, 'recipes'));
        setRecipes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Recipe)));
      } catch (err) {
        console.error('[TermScheduleEditor] Failed to fetch recipes:', err);
      }
    };
    fetchRecipes();
  }, []);

  useEffect(() => {
    setLocalSchedule(schedule);
  }, [schedule]);

  const persistSchedule = async (updatedSchedule: ScheduleEntry[]) => {
    try {
      await updateDoc(doc(db, 'sessions', sessionId), {
        schedule: updatedSchedule,
      });
      setLocalSchedule(updatedSchedule);
      onScheduleChange?.(updatedSchedule);
      setError('');
    } catch (err) {
      console.error('[TermScheduleEditor] Failed to save schedule:', err);
      setError('Failed to save changes. Please try again.');
    }
  };

  const handleRecipeSelect = async (index: number, recipeId: string) => {
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe) return;

    setSaving(localSchedule[index].date);
    const updatedSchedule = [...localSchedule];
    updatedSchedule[index] = {
      ...updatedSchedule[index],
      recipeId: recipe.id,
      recipeName: recipe.name,
      recipePhotoUrl: recipe.photoUrl || '',
    };
    await persistSchedule(updatedSchedule);
    setSaving(null);
  };

  const handleClearRecipe = async (index: number) => {
    setSaving(localSchedule[index].date);
    const updatedSchedule = [...localSchedule];
    updatedSchedule[index] = {
      ...updatedSchedule[index],
      recipeId: '',
      recipeName: '',
      recipePhotoUrl: '',
    };
    await persistSchedule(updatedSchedule);
    setSaving(null);
  };

  const handleToggleSkip = async (index: number) => {
    setSaving(localSchedule[index].date);
    const updatedSchedule = [...localSchedule];
    const currentStatus = updatedSchedule[index].status;
    updatedSchedule[index] = {
      ...updatedSchedule[index],
      status: currentStatus === 'skipped' ? 'active' : 'skipped',
    };
    await persistSchedule(updatedSchedule);
    setSaving(null);
  };

  const handleAddMakeUpDate = async () => {
    if (!makeUpDate) return;

    // Check for duplicate date
    if (localSchedule.some((entry) => entry.date === makeUpDate)) {
      setError('This date already exists in the schedule.');
      return;
    }

    setSaving('make-up');
    const updatedSchedule = insertDate(localSchedule, makeUpDate);
    await persistSchedule(updatedSchedule);
    setMakeUpDate('');
    setSaving(null);
  };

  const formatDate = (dateStr: string): string => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const activeCount = getActiveSessionCount(localSchedule);

  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <h3 className={styles.title}>Term Schedule</h3>
        <span className={styles.activeCount}>
          <Calendar size={14} />
          {activeCount} active session{activeCount !== 1 ? 's' : ''} of {localSchedule.length} total
        </span>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.scheduleList}>
        {localSchedule.map((entry, index) => {
          const isSkipped = entry.status === 'skipped';
          const isSaving = saving === entry.date;

          return (
            <div
              key={entry.date}
              className={`${styles.entryRow} ${isSkipped ? styles.entrySkipped : ''}`}
            >
              <div className={styles.entryDate}>
                <span className={styles.dateText}>{formatDate(entry.date)}</span>
                {isSkipped && <span className={styles.skippedBadge}>Skipped</span>}
              </div>

              <div className={styles.entryRecipe}>
                {!isSkipped && (
                  <>
                    {entry.recipePhotoUrl ? (
                      <img
                        src={entry.recipePhotoUrl}
                        alt={entry.recipeName}
                        className={styles.recipeThumb}
                      />
                    ) : (
                      <span className={styles.recipePlaceholder}>
                        <ChefHat size={14} />
                      </span>
                    )}
                    <select
                      className={`form-select ${styles.recipeSelect}`}
                      value={entry.recipeId}
                      onChange={(e) => handleRecipeSelect(index, e.target.value)}
                      disabled={isSaving}
                      aria-label={`Select recipe for ${entry.date}`}
                    >
                      <option value="">Select recipe...</option>
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    {entry.recipeId && (
                      <button
                        type="button"
                        className={styles.clearBtn}
                        onClick={() => handleClearRecipe(index)}
                        disabled={isSaving}
                        title="Clear recipe"
                        aria-label={`Clear recipe for ${entry.date}`}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className={styles.entryActions}>
                <button
                  type="button"
                  className={`${styles.skipBtn} ${isSkipped ? styles.skipBtnActive : ''}`}
                  onClick={() => handleToggleSkip(index)}
                  disabled={isSaving}
                  title={isSkipped ? 'Restore date' : 'Skip date'}
                  aria-label={isSkipped ? `Restore ${entry.date}` : `Skip ${entry.date}`}
                >
                  <SkipForward size={14} />
                  {isSkipped ? 'Restore' : 'Skip'}
                </button>
              </div>

              {isSaving && <span className={styles.savingIndicator}>Saving...</span>}
            </div>
          );
        })}
      </div>

      <div className={styles.addMakeUp}>
        <label className={styles.addMakeUpLabel}>
          <Plus size={14} />
          Add Make-up Date
        </label>
        <div className={styles.addMakeUpRow}>
          <input
            type="date"
            className="form-input"
            value={makeUpDate}
            onChange={(e) => setMakeUpDate(e.target.value)}
            aria-label="Make-up date"
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleAddMakeUpDate}
            disabled={!makeUpDate || saving === 'make-up'}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
