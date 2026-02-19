import type { Metadata } from 'next';
import Link from 'next/link';
import { Clock, Users, MapPin, Star, Shield, Heart, ChefHat, ArrowRight } from 'lucide-react';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'Blooming Tastebuds | Kids & Young Adult Cooking Classes',
    description: 'Empowering children and young adults through the magic of healthy cooking. Book your session today at one of our London venues.',
};

export default function HomePage() {
    return (
        <>
            {/* ── HERO ── */}
            <section className={styles.hero}>
                <div className={`container ${styles.heroContent}`}>
                    <span className={styles.heroBadge}>Now booking sessions for Winter 2026</span>
                    <h1 className={styles.heroTitle}>
                        Cooking classes for the<br />
                        <span className={styles.heroAccent}>next generation.</span>
                    </h1>
                    <p className={styles.heroSub}>
                        Hands-on sessions for children and young adults.<br className="hide-mobile" />
                        Build confidence, creativity, and a lifelong love of food.
                    </p>
                    <div className={styles.heroCtas}>
                        <Link href="/portal/find-class" className="btn btn-primary btn-lg">
                            Find a Class
                        </Link>
                        <Link href="/auth/signup" className="btn btn-ghost btn-lg">
                            Register Free <ArrowRight size={18} />
                        </Link>
                    </div>
                    <div className={styles.heroStats}>
                        <div className={styles.stat}><strong>200+</strong><span>Students</span></div>
                        <div className={styles.statDivider} />
                        <div className={styles.stat}><strong>5.0</strong><span>Rating</span></div>
                        <div className={styles.statDivider} />
                        <div className={styles.stat}><strong>DBS</strong><span>Certified</span></div>
                    </div>
                </div>
            </section>

            {/* ── CLASS TYPES ── */}
            <section className={`section ${styles.classTypes}`}>
                <div className="container">
                    <div className="section-header">
                        <span className="eyebrow">Our Classes</span>
                        <h2>Designed for every age.</h2>
                        <p>Choose the class that fits your schedule — all sessions are booked individually.</p>
                    </div>

                    <div className={styles.classGrid}>
                        {/* Kids Card */}
                        <div className={styles.classCard}>
                            <div className={styles.classCardEmoji}>🧒</div>
                            <div className={styles.classCardBadge}>Ages 5–12</div>
                            <h3>After School Club</h3>
                            <p>Monday afternoon sessions where children explore recipes and develop kitchen skills in a safe environment.</p>
                            <ul className={styles.classDetails}>
                                <li><Clock size={16} /><span>Mon, 3:30–4:30 pm</span></li>
                                <li><Users size={16} /><span>Small group focus</span></li>
                                <li><MapPin size={16} /><span>Local venues</span></li>
                                <li><Shield size={16} /><span>DBS-checked</span></li>
                            </ul>
                            <Link href="/courses#kids" className="btn btn-secondary btn-full">
                                Book a Session
                            </Link>
                        </div>

                        {/* Young Adults Card */}
                        <div className={styles.classCard}>
                            <div className={styles.classCardEmoji}>🎓</div>
                            <div className={`${styles.classCardBadge} ${styles.greenBadge}`}>Young Adults</div>
                            <h3>Weekend Classes</h3>
                            <p>Saturday and Sunday sessions designed for older students to master essential life skills and build independence.</p>
                            <ul className={styles.classDetails}>
                                <li><Clock size={16} /><span>Sat & Sun</span></li>
                                <li><Users size={16} /><span>Social atmosphere</span></li>
                                <li><MapPin size={16} /><span>Premium venues</span></li>
                                <li><Heart size={16} /><span>Life skills focus</span></li>
                            </ul>
                            <Link href="/courses#young-adults" className="btn btn-secondary btn-full">
                                Book a Session
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── MISSION STRIP ── */}
            <section className={styles.mission}>
                <div className="container">
                    <div className={styles.missionInner}>
                        <div className={styles.missionText}>
                            <span className="eyebrow">Our Mission</span>
                            <h2>Nurturing the joy of food.</h2>
                            <p>
                                At Blooming Tastebuds, we believe every child deserves the confidence
                                to cook nutritious, delicious meals. Our sessions go beyond recipes — we nurture
                                curiosity, teamwork, and independence.
                            </p>
                            <Link href="/about" className="btn btn-ghost" style={{ marginTop: '1.5rem' }}>
                                Meet Our Founder <ArrowRight size={16} />
                            </Link>
                        </div>
                        <div className={styles.missionFeatures}>
                            {[
                                { icon: '🛡️', title: 'Safety First', desc: 'Medical info collected at booking.' },
                                { icon: '🌱', title: 'Inclusive', desc: 'We accommodate all dietary needs.' },
                                { icon: '👩‍🍳', title: 'Expert Chefs', desc: 'Passionate coaches who love to teach.' },
                                { icon: '📱', title: 'Easy Booking', desc: 'Manage everything entirely online.' },
                            ].map((f) => (
                                <div key={f.title} className={styles.featureItem}>
                                    <span className={styles.featureIcon}>{f.icon}</span>
                                    <div>
                                        <strong>{f.title}</strong>
                                        <p>{f.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section className={`section ${styles.howItWorks}`}>
                <div className="container">
                    <div className="section-header">
                        <span className="eyebrow">Process</span>
                        <h2>Simple as a recipe.</h2>
                    </div>
                    <div className={styles.stepsGrid}>
                        {[
                            { n: '01', title: 'Register', desc: 'Create an account in under 2 minutes.' },
                            { n: '02', title: 'Find', desc: 'Pick the perfect class and date.' },
                            { n: '03', title: 'Book', desc: 'Secure your spot via Stripe.' },
                            { n: '04', title: 'Cook', desc: 'Show up and start creating.' },
                        ].map((s) => (
                            <div key={s.n} className={styles.step}>
                                <div className={styles.stepNumber}>{s.n}</div>
                                <h4>{s.title}</h4>
                                <p>{s.desc}</p>
                            </div>
                        ))}
                    </div>
                    <div className={styles.howCta}>
                        <Link href="/auth/signup" className="btn btn-primary btn-lg">
                            Get Started
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── TESTIMONIALS ── */}
            <section className={`section ${styles.testimonials}`}>
                <div className="container">
                    <div className="section-header">
                        <span className="eyebrow">Reviews</span>
                        <h2>Loved by parents and kids.</h2>
                    </div>
                    <div className={styles.testimonialGrid}>
                        {[
                            { quote: 'My daughter absolutely loves the Monday sessions. She comes home so proud of what she\'s made.', name: 'Sarah M.', role: 'Parent of Lily' },
                            { quote: 'The booking process was so easy. I love that I can see the recipe before I book.', name: 'James T.', role: 'Parent of twins' },
                            { quote: 'As a student heading to uni, these classes gave me real confidence.', name: 'Priya K.', role: 'Young Adult student' },
                        ].map((t) => (
                            <div key={t.name} className={`card ${styles.testimonialCard}`}>
                                <div className={styles.stars}>
                                    {[...Array(5)].map((_, i) => <Star key={i} size={14} fill="currentColor" />)}
                                </div>
                                <p className={styles.quote}>"{t.quote}"</p>
                                <div className={styles.testimonialAuthor}>
                                    <strong>{t.name}</strong>
                                    <span>{t.role}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA BANNER ── */}
            <section className={styles.ctaBanner}>
                <div className="container">
                    <ChefHat size={48} strokeWidth={1} color="var(--bt-gray-400)" />
                    <h2>Start your cooking journey.</h2>
                    <p>Join hundreds of local families who've discovered the joy of healthy cooking.</p>
                    <div className={styles.heroCtas}>
                        <Link href="/auth/signup" className="btn btn-primary btn-lg">
                            Register Now
                        </Link>
                        <Link href="/courses" className="btn btn-ghost btn-lg">
                            Explore Classes
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
