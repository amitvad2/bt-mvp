import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'About Us | Blooming Tastebuds',
    description: 'Learn about the journey of Blooming Tastebuds and our mission to teach the next generation how to cook healthy, delicious food.',
};

export default function AboutPage() {
    return (
        <>
            {/* Hero */}
            <section className={styles.hero}>
                <div className="container">
                    <span className="eyebrow">About Us</span>
                    <h1>A Passion for Food,<br />A Mission to Inspire</h1>
                    <p>Blooming Tastebuds was born from a simple belief: every child and young adult deserves the confidence to cook.</p>
                </div>
            </section>

            {/* Founder Bio */}
            <section className={`section ${styles.founder}`}>
                <div className="container">
                    <div className={styles.founderGrid}>
                        <div className={styles.founderImage}>
                            <div className={styles.imagePlaceholder}>
                                <span>👩‍🍳</span>
                                <p>Founder Photo</p>
                            </div>
                        </div>
                        <div className={styles.founderText}>
                            <span className="eyebrow">Meet the Founder</span>
                            <h2>A Chef, Educator & Entrepreneur</h2>
                            <p>
                                Blooming Tastebuds was founded with a heartfelt mission: to make cooking accessible,
                                joyful, and empowering for young people. Our founder brings years of culinary expertise
                                and a deep passion for education to every class.
                            </p>
                            <p>
                                Having worked in professional kitchens and educational settings, she recognised a gap
                                in the market for high-quality, affordable cooking classes that truly prioritise
                                safety, inclusivity, and fun.
                            </p>
                            <p>
                                What started as a small after-school club has grown into a thriving community of
                                young chefs and their families — all united by a love of food and learning.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Journey Timeline */}
            <section className={`section ${styles.journey}`}>
                <div className="container">
                    <div className="section-header">
                        <span className="eyebrow">Our Journey</span>
                        <h2>From Kitchen Table to Community Kitchen</h2>
                    </div>
                    <div className={styles.timeline}>
                        {[
                            { year: '2020', title: 'The Idea', desc: 'Inspired by her own children\'s love of cooking, our founder began teaching small groups from her home kitchen.' },
                            { year: '2021', title: 'First Classes', desc: 'The After School Club launched at a local primary school, quickly filling up with enthusiastic young chefs.' },
                            { year: '2022', title: 'Growing Community', desc: 'Expanded to multiple venues and introduced Weekend Classes for young adults heading to university.' },
                            { year: '2023', title: 'Going Digital', desc: 'Launched online booking to make it easier for families to find and book sessions around their busy lives.' },
                            { year: '2024+', title: 'Blooming Further', desc: 'Continuing to grow, with new venues, new recipes, and the same warm, welcoming spirit at the heart of everything.' },
                        ].map((item, i) => (
                            <div key={item.year} className={styles.timelineItem}>
                                <div className={styles.timelineYear}>{item.year}</div>
                                <div className={styles.timelineDot} />
                                <div className={styles.timelineContent}>
                                    <h4>{item.title}</h4>
                                    <p>{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Values */}
            <section className={`section ${styles.values}`}>
                <div className="container">
                    <div className="section-header">
                        <span className="eyebrow">What We Stand For</span>
                        <h2>Our Values</h2>
                    </div>
                    <div className={styles.valuesGrid}>
                        {[
                            { icon: '🛡️', title: 'Safety', desc: 'Every instructor is DBS-checked. Medical information is collected before every session. Your child\'s wellbeing is our top priority.' },
                            { icon: '🌈', title: 'Inclusivity', desc: 'We welcome children and young adults of all abilities, dietary needs, and backgrounds. Every student belongs here.' },
                            { icon: '🎉', title: 'Fun First', desc: 'Learning happens best when you\'re having fun. Our sessions are energetic, creative, and genuinely enjoyable.' },
                            { icon: '🌱', title: 'Growth', desc: 'We nurture confidence, independence, and a lifelong love of cooking — skills that will serve students for life.' },
                            { icon: '🤝', title: 'Community', desc: 'Blooming Tastebuds is more than a class — it\'s a community of families, students, and educators who share a love of food.' },
                            { icon: '✨', title: 'Excellence', desc: 'We hold ourselves to high standards in everything — from the recipes we choose to the way we communicate with families.' },
                        ].map((v) => (
                            <div key={v.title} className={`card ${styles.valueCard}`}>
                                <span className={styles.valueIcon}>{v.icon}</span>
                                <h4>{v.title}</h4>
                                <p>{v.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className={styles.cta}>
                <div className="container">
                    <h2>Ready to Join the Blooming Tastebuds Family?</h2>
                    <p>Register today and book your first session in minutes.</p>
                    <Link href="/auth/signup" className="btn btn-primary btn-lg">
                        Get Started <ArrowRight size={18} />
                    </Link>
                </div>
            </section>
        </>
    );
}
