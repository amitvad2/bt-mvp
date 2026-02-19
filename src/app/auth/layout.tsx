import styles from './auth.module.css';
import Link from 'next/link';
import { ChefHat } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className={styles.layout}>
            <div className={styles.brand}>
                <div className={styles.brandInner}>
                    <Link href="/" className={styles.logo}>
                        <ChefHat size={32} strokeWidth={1.5} />
                        <span>Blooming Tastebuds</span>
                    </Link>
                    <p>Your cooking journey starts here.</p>
                    <div className={styles.features}>
                        {['Easy online booking', 'Safe & supervised sessions', 'Per-session flexibility', 'Secure Stripe payments'].map(f => (
                            <div key={f} className={styles.feature}>
                                <span>✓</span> {f}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className={styles.form}>
                <div className={styles.formInner}>
                    {children}
                </div>
            </div>
        </div>
    );
}
