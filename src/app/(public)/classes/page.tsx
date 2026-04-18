import type { Metadata } from 'next';
import styles from './page.module.css';
import ClassesClient from './ClassesClient';

export const metadata: Metadata = {
    title: 'Find a Class | Blooming Tastebuds',
    description: 'Browse upcoming vegetarian cooking sessions for kids aged 5–11 and young adults 12+. No account needed to explore — sign up when you\'re ready to book.',
};

export default function ClassesPage() {
    return (
        <>
            {/* ── HERO ── */}
            <section className={styles.hero}>
                <div className="container">
                    <span className="eyebrow">Available Sessions</span>
                    <h1>Find a Class</h1>
                    <p>Hands-on vegetarian cooking for ages 5–16. Browse sessions near you and book your spot in minutes.</p>
                </div>
            </section>

            {/* ── LEARNING PATHS ── */}
            <section className={styles.pathsSection}>
                <div className="container">
                    <div className={styles.pathsGrid}>
                        <div className={styles.pathCard}>
                            <span className={styles.pathEmoji}>🍳</span>
                            <div>
                                <h3>Little Chefs After-School Club</h3>
                                <span className={styles.pathAge}>Ages 5–11</span>
                            </div>
                            <p>A fun, safe introduction to healthy cooking. Kids explore fresh ingredients, basic kitchen skills, and the joy of making food from scratch in a supportive group setting.</p>
                        </div>
                        <div className={`${styles.pathCard} ${styles.pathCardTeen}`}>
                            <span className={styles.pathEmoji}>🔥</span>
                            <div>
                                <h3>Weekend Workshops</h3>
                                <span className={`${styles.pathAge} ${styles.pathAgeTeen}`}>Ages 12+</span>
                            </div>
                            <p>Real-world cooking skills for growing independence. From knife technique to budget meal planning — ideal for Duke of Edinburgh and life beyond the family kitchen.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── REASSURANCE STRIP ── */}
            <div className={styles.reassuranceStrip}>
                <div className="container">
                    <ul className={styles.reassuranceList}>
                        <li><span aria-hidden="true">🥦</span> 100% vegetarian cooking</li>
                        <li><span aria-hidden="true">⚠️</span> Allergy-aware sessions</li>
                        <li><span aria-hidden="true">🛡️</span> DBS-checked instructor</li>
                        <li><span aria-hidden="true">👕</span> Aprons provided — just bring yourself</li>
                        <li><span aria-hidden="true">💳</span> Easy online booking</li>
                    </ul>
                </div>
            </div>

            {/* ── SESSION BROWSER ── */}
            <section className={`section ${styles.content}`}>
                <div className="container">
                    <ClassesClient />
                </div>
            </section>
        </>
    );
}
