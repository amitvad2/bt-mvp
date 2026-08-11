import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';
import ClassesClient from './ClassesClient';

export const metadata: Metadata = {
    title: 'Find a Class | Blooming Tastebuds',
    description: 'Browse upcoming vegetarian cooking sessions for kids aged 5–11 and young adults 12–18. No account needed to explore — sign up when you\'re ready to book.',
};

export default function ClassesPage() {
    return (
        <>
            {/* ── HERO ── */}
            <section className={styles.hero}>
                <div className="container">
                    <span className="eyebrow">Available Sessions</span>
                    <h1>Find a Class</h1>
                    <p>Hands-on vegetarian cooking for ages 5–18. Browse sessions near you and book your spot in minutes.</p>
                </div>
            </section>

            {/* ── LEARNING PATHS ── */}
            <section className={styles.pathsSection}>
                <div className="container">
                    <div className={styles.pathsGrid}>
                        <div className={styles.pathCard}>
                            <div>
                                <h3>Junior Cooks</h3>
                                <span className={styles.pathAge}>Ages 5–11</span>
                            </div>
                            <p>A fun, safe introduction to healthy cooking. Kids explore fresh ingredients, basic kitchen skills, and the joy of making food from scratch in a supportive group setting.</p>
                            <Link href="?type=kids-weekend#sessions" className={styles.pathLink}>
                                Browse Junior Cook sessions →
                            </Link>
                        </div>
                        <div className={`${styles.pathCard} ${styles.pathCardTeen}`}>
                            <div>
                                <h3>Teen Chefs</h3>
                                <span className={`${styles.pathAge} ${styles.pathAgeTeen}`}>Ages 12–18</span>
                            </div>
                            <p>Real-world cooking skills for growing independence. From knife technique to budget meal planning — ideal for Duke of Edinburgh and life beyond the family kitchen.</p>
                            <Link href="?type=young-weekend#sessions" className={`${styles.pathLink} ${styles.pathLinkTeen}`}>
                                Browse Teen Chef sessions →
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── REASSURANCE STRIP ── */}
            <div className={styles.reassuranceStrip}>
                <div className="container">
                    <ul className={styles.reassuranceList}>
                        <li>100% vegetarian cooking</li>
                        <li>Allergy-aware sessions</li>
                        <li>DBS-checked instructor</li>
                        <li>Aprons provided — just bring yourself</li>
                        <li>Easy online booking</li>
                    </ul>
                </div>
            </div>

            {/* ── SESSION BROWSER ── */}
            <section id="sessions" className={`section ${styles.content}`}>
                <div className="container">
                    <ClassesClient />
                </div>
            </section>
        </>
    );
}
