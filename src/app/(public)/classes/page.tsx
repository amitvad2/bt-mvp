import type { Metadata } from 'next';
import styles from './page.module.css';
import ClassesClient from './ClassesClient';

export const metadata: Metadata = {
    title: 'Browse Classes | Blooming Tastebuds',
    description: 'Browse available cooking sessions for kids and young adults. No account needed to explore — sign up when you\'re ready to book.',
};

export default function ClassesPage() {
    return (
        <>
            <section className={styles.hero}>
                <div className="container">
                    <span className="eyebrow">Available Sessions</span>
                    <h1>Find a Class</h1>
                    <p>Browse our upcoming cooking sessions. Create a free account to book your spot.</p>
                </div>
            </section>

            <section className={`section ${styles.content}`}>
                <div className="container">
                    <ClassesClient />
                </div>
            </section>
        </>
    );
}
