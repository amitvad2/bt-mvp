import type { Metadata } from 'next';
import { Star, Shield, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import styles from './page.module.css';
import ExpandableReview from './ExpandableReview';

export const metadata: Metadata = {
    title: 'Testimonies | Blooming Tastebuds',
    description: 'Read what schools, parents, and students have to say about our cooking classes.',
};

export default function TestimoniesPage() {
    return (
        <div className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className="container">
                    <span className="eyebrow">Reviews & Testimonies</span>
                    <h1>Loved by the community.</h1>
                    <p>Discover how Blooming Tastebuds is making an impact in schools and homes.</p>
                </div>
            </header>

            {/* Main Content */}
            <main className="container">
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Shield size={32} className="text-bt-accent" />
                        <h2>Academy Review</h2>
                        <p className={styles.subtitle}>Feedback from our educational partners</p>
                    </div>

                    <ExpandableReview
                        quote="Nisha has been an exceptional cooking teacher, demonstrating professionalism, dedication, and a passion for teaching. She communicates effectively, simplifies complex cooking techniques, and delivers engaging lessons for students across Key Stages 3 to 5. Her punctuality, innovative methods, and ability to inspire a love for culinary arts have made a lasting impact on our school community."
                        authorTitle="Enrichment Lead"
                        authorOrg="Ark Elvin Academy"
                        imageSrc="/images/ark-elvin-review.png"
                    />
                </section>

                <hr className={styles.divider} />

                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Star size={32} className="text-bt-accent" />
                        <h2>Parent & Student Reviews</h2>
                        <p className={styles.subtitle}>Stories from families discovering the joy of cooking</p>
                    </div>

                    <div className={styles.grid}>
                        {[
                            {
                                quote: 'Personally, cooking club taught me a lot of different food and skill and tips. Cooking club is really useful in life as now I know to do wrap before, I completely had no idea. Thank you so much for teaching me lots of different food. It helped me a lot.',
                                name: 'Kiran',
                                role: 'Student',
                                imageSrc: '/images/review-kiran.jpg' // Assuming they save this as jpg
                            },
                            {
                                quote: 'Thank you so much for this cooking club, I have enjoyed a lot in this class and I have learned a lot from this cooking class. And thank you for teaching these all amazing food recipes. I will miss you.',
                                name: 'Aroshi',
                                role: 'Student',
                                imageSrc: '/images/review-aroshi.jpg'
                            },
                            {
                                quote: 'Thank you so much for this mind-blowing opportunity in the cooking club. I learnt from cooking fried rice (my best cooking session) to baking and making pancakes. After attending your session, I feel like I improved so much and piqued my interest in cooking, and I now want to pursue a career in being a chef. Thank you for everything, especially the techniques.',
                                name: 'Reagan AKA Chef Riggs',
                                role: 'Student',
                                imageSrc: '/images/review-reagan.jpg'
                            },
                            {
                                quote: 'She has a very good experience in cooking and she has taught us many things for e.g. fried rice cooking, pasta, wedges and many more. It was a very fun experience. Very helpful and lovely teacher.',
                                name: 'Ian',
                                role: 'Student',
                                imageSrc: '/images/review-ian.jpg'
                            },
                            {
                                quote: 'It was a good experience with Ms. She taught us many things which is very helpful for us. It was so fun.',
                                name: 'Hishma',
                                role: 'Student',
                                imageSrc: '/images/review-hishma.jpg'
                            },
                            {
                                quote: 'Ms. has taught us a lot, she helped us every time we needed help and we did lots of new things, it improved our cooking skill as well and also we had lot of fun.',
                                name: 'Ashwini',
                                role: 'Student',
                                imageSrc: '/images/review-ashwini.jpg'
                            },
                            {
                                quote: 'Very very helpful. Explains different cooking techniques in detail and demonstrates it as well! and plans the recipes based on healthy food diet.',
                                name: 'Reagan Rfds.',
                                role: 'Student',
                                imageSrc: '/images/review-reagan-rfds.jpg'
                            },
                            {
                                quote: 'I learnt to cut vegetables with knife and I have learnt how to cook food and dessert.',
                                name: 'Sharanitha',
                                role: 'Student',
                                imageSrc: '/images/review-sharanitha.jpg'
                            },
                            {
                                quote: 'It was very help to learn cooking and it seems easy. I find it more interesting cooking cause I really want to learn. The way you teach us Ms. is very help full. Thank you so much Ms.',
                                name: 'Dinakshi',
                                role: 'Student',
                                imageSrc: '/images/review-dinakshi.jpg'
                            },
                            {
                                quote: 'The cooking session was fun because I got to cook with my friend which was a new experience, also I learned to make recipes which were healthy and tasty which will help me when I go to uni and live on my own.',
                                name: 'Edolio, Sumaya & Suicya',
                                role: 'Student Group',
                                imageSrc: '/images/review-edolio-group.jpg'
                            },
                            {
                                quote: 'The cooking session went so fun and amazing. I learnt a lot of skills and enjoy the free time to do something I love.',
                                name: 'Hassan & Emplot Leanne',
                                role: 'Student Group',
                                imageSrc: '/images/review-hassan-group.jpg'
                            },
                        ].map((t, idx) => (
                            <ExpandableReview
                                key={idx}
                                quote={t.quote}
                                authorTitle={t.name}
                                authorOrg={t.role}
                                imageSrc={t.imageSrc}
                            />
                        ))}
                    </div>
                </section>
            </main>

            {/* Call to Action */}
            <section className={styles.cta}>
                <div className="container text-center">
                    <h2>Ready to start your journey?</h2>
                    <p>Join hundreds of happy families learning to cook healthy meals.</p>
                    <div className={styles.ctaButtons}>
                        <Link href="/auth/signup" className="btn btn-primary btn-lg">
                            Register Now
                        </Link>
                        <Link href="/portal/find-class" className="btn btn-ghost btn-lg">
                            Find a Class <ArrowRight size={18} />
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
