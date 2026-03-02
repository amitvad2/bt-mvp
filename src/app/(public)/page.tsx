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

            {/* Features Section */}
            <section className="section">
                <div className="container">
                    <div className={styles.featuresHeader}>
                        <span className="eyebrow">Our Mission</span>
                        <h2>Nurturing Confident Cooks</h2>
                        <p>Cooking adventures for kids and teens</p>
                    </div>

                    <div className={styles.featuresLayout}>
                        <div className={styles.featuresImageWrapper}>
                            <img src="/images/nurturing-cooks.jpg" alt="Students cooking at Blooming Tastebuds" className={styles.featuresImage} />
                        </div>
                        <div className={styles.featureGrid}>
                            <div className={styles.featureCard}>
                                <div className={styles.featureIcon}>🍳</div>
                                <h3>Culinary Confidence</h3>
                                <p>Discover the joy of cooking with easy-to-learn recipes and techniques. Build essential life skills, boost your confidence in the kitchen, and have fun along the way.</p>
                            </div>
                            <div className={styles.featureCard}>
                                <div className={styles.featureIcon}>🌱</div>
                                <h3>Vegetarian Adventures</h3>
                                <p>At Blooming Tastebuds, we inspire young minds to explore the joys of healthy cooking. We teach students how to whip up delicious and nutritious vegetarian dishes.</p>
                            </div>
                            <div className={styles.featureCard}>
                                <div className={styles.featureIcon}>✨</div>
                                <h3>Life Skills</h3>
                                <p>Through dynamic cooking sessions and hands-on learning, we foster essential life skills, culinary confidence, and creativity in each child.</p>
                            </div>
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
                        <div className={styles.testimonialCard}>
                            <div className={styles.testimonialContent}>
                                <div className={styles.stars}>
                                    {[...Array(5)].map((_, i) => <Star key={i} size={18} fill="currentColor" />)}
                                </div>
                                <p className={styles.quote}>
                                    "Nisha has been an exceptional cooking teacher, demonstrating professionalism, dedication, and a passion for teaching. She communicates effectively, simplifies complex cooking techniques, and delivers engaging lessons for students across Key Stages 3 to 5. Her punctuality, innovative methods, and ability to inspire a love for culinary arts have made a lasting impact on our school community."
                                </p>
                                <div className={styles.testimonialAuthor}>
                                    <strong>Academy Review</strong>
                                    <span>Enrichment Lead, Ark Elvin Academy</span>
                                </div>
                            </div>
                        </div>
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
