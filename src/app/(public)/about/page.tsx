import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import fs from 'fs';
import path from 'path';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'About Us | Blooming Tastebuds',
    description: 'Learn about the journey of Blooming Tastebuds and our mission to teach the next generation how to cook healthy, delicious food.',
};

export default function AboutPage() {
    // Check if founder photo exists in public directory
    let founderImageSrc = null;
    const publicDir = path.join(process.cwd(), 'public');
    const possibleFiles = ['founder.jpg', 'founder.jpeg', 'founder.png', 'founder.webp'];

    for (const file of possibleFiles) {
        if (fs.existsSync(path.join(publicDir, file))) {
            founderImageSrc = `/${file}`;
            break;
        }
    }

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
                            {founderImageSrc ? (
                                <Image
                                    src={founderImageSrc}
                                    alt="Founder of Blooming Tastebuds"
                                    width={400}
                                    height={533}
                                    className={styles.founderImgTag}
                                />
                            ) : (
                                <div className={styles.imagePlaceholder}>
                                    <span>👩‍🍳</span>
                                    <p>Add &apos;founder.jpg&apos; to public folder</p>
                                </div>
                            )}
                        </div>
                        <div className={styles.founderText}>
                            <span className="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>The Instructor</span>
                            <h2 style={{ marginBottom: 'var(--space-6)' }}>Nisha Vadhel</h2>

                            <p>Welcome to Blooming Tastebuds!</p>

                            <p>I'm Nisha Vadhel, the founder of Blooming Tastebuds and a dedicated cooking instructor based in London, UK. With over two years of experience teaching healthy and vegetarian recipes to school students, I am passionate about equipping young minds with essential culinary and life skills.</p>

                            <p>At Ark Elvin Academy in Wembley, I've led cooking sessions for Year 11 and Year 13 students, fostering creativity and independence through engaging, hands-on lessons. Beyond the classroom, I contribute to Fun Fest holiday club, Northwood during school holidays, encouraging creativity, teamwork, and confidence in children through fun activities. Currently I work twice a week with smart raspberry after school cooking club with children aged 5 - 10 yrs.</p>

                            <p>My commitment to community service is reflected in my volunteer work with organizations such as:</p>

                            <ul className={styles.volunteerList}>
                                <li><strong>Bags of Taste:</strong> Teaching vulnerable individuals the art of home cooking through online mentoring.</li>
                                <li><strong>FoodCycle:</strong> Supporting the delivery of community meals to those in need.</li>
                                <li><strong>Sue Ryder:</strong> Contributing to meaningful causes while building connections through work in their charity shop.</li>
                                <li><strong>Girlguiding:</strong> Assisting in running activities that help young girls build confidence, teamwork, and essential life skills.</li>
                            </ul>

                            <p>Driven by a passion for promoting healthier lifestyles and nurturing young minds, I aspire to open a cooking school for young learners. This initiative combines my love for teaching with my belief in the transformative value of homemade meals, empowering individuals to gain independence and embrace nutritious living.</p>

                            <p>At Blooming Tastebuds, my mission is to bridge the gap between young people and the culinary world, fostering a deep appreciation for vegetarian cuisine and inspiring the creation of nourishing and delicious meals. I believe that empowering young minds to prepare their own vegetarian meals can instill a lifelong habit of healthier eating, thereby reducing their dependence on processed foods.</p>

                            <p className={styles.founderSignoff}>Join us on this flavorful journey towards health, creativity, and independence!</p>
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

            {/* FAQ */}
            <section className={`section ${styles.faq}`}>
                <div className="container">
                    <div className="section-header" style={{ marginBottom: '4rem' }}>
                        <h2>Common Questions</h2>
                    </div>
                    <div className={styles.faqGrid}>
                        {[
                            { q: 'Do I need to commit to a full term?', a: 'No! All sessions are booked individually. Book as many or as few as you like.' },
                            { q: 'What if my child has allergies?', a: 'We collect detailed medical and allergy information at booking. Our instructors are trained to handle allergies safely.' },
                            { q: 'How do I cancel a booking?', a: 'You can cancel upcoming sessions from your portal dashboard. Please check our Terms & Conditions for our cancellation policy.' },
                            { q: 'Can I book for multiple children?', a: 'Yes! Parent accounts can manage multiple students and book sessions for each child separately.' },
                            { q: 'What should my child bring?', a: 'Just themselves! All ingredients and equipment are provided. An apron is a nice touch but not required.' },
                            { q: 'How do I pay?', a: 'All payments are made securely online via Stripe. You\'ll receive a booking confirmation and receipt by email.' },
                        ].map((f) => (
                            <div key={f.q} className={styles.faqCard}>
                                <h4>{f.q}</h4>
                                <p>{f.a}</p>
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
