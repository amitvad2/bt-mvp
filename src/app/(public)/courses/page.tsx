import type { Metadata } from 'next';
import Link from 'next/link';
import { ChefHat, ArrowRight, CheckCircle, Clock, Users, ShieldCheck, MapPin, Shield } from 'lucide-react';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'Our Courses | Blooming Tastebuds',
    description: 'Discover our Kids After School Clubs and Young Adult Weekend Workshops. Find the perfect cooking class for your child.',
};

export default function CoursesPage() {
    return (
        <>
            <section className={styles.hero}>
                <div className="container">
                    <h1>Find the Right Class for You</h1>
                    <p>Flexible per-session booking with no long-term commitments. Just great cooking, twice a week.</p>
                </div>
            </section>

            {/* Kids After School Club */}
            <section id="kids" className={styles.courseSection}>
                <div className="container">
                    <div className={styles.courseGrid}>
                        <div className={styles.courseVisual}>
                            <div className={styles.courseEmoji}>🧑‍🍳</div>
                            <div className={styles.courseTag}>Ages 5–12</div>
                        </div>
                        <div className={styles.courseInfo}>
                            <h2>Kids Cooking Club</h2>
                            <p className={styles.courseDesc}>
                                Our after-school sessions are the perfect way for children to discover
                                the joy of cooking. Each session focuses on a new recipe, building skills
                                and confidence in a safe, fun environment.
                            </p>

                            <div className={styles.detailGrid}>
                                <div className={styles.detail}><Clock size={20} strokeWidth={1.5} /><div><strong>Time</strong><span>Mondays, 3:30–4:30 pm</span></div></div>
                                <div className={styles.detail}><Users size={20} strokeWidth={1.5} /><div><strong>Students</strong><span>Ages 5–12</span></div></div>
                                <div className={styles.detail}><MapPin size={20} strokeWidth={1.5} /><div><strong>Location</strong><span>Multiple Venues</span></div></div>
                                <div className={styles.detail}><Shield size={20} strokeWidth={1.5} /><div><strong>Safety</strong><span>DBS Instructors</span></div></div>
                            </div>

                            <div className={styles.includes}>
                                <h4>What's Included</h4>
                                <ul>
                                    {['Ingredients provided', 'Recipe cards', 'Small group sizes', 'Safety-first focus', 'Emergency contact registry', 'Allergen aware'].map(i => (
                                        <li key={i}><CheckCircle size={16} strokeWidth={1.5} />{i}</li>
                                    ))}
                                </ul>
                            </div>

                            <div className={styles.bookingNote}>
                                <strong>📅 Flexibly Booked</strong>
                                <p>Book individual sessions — no term commitment required. Perfect for busy schedules.</p>
                            </div>

                            <Link href="/portal/find-class?type=kidsAfterSchool" className="btn btn-primary btn-lg">
                                Book a Kids Session
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <div className={styles.courseDivider} />

            {/* Young Adults */}
            <section id="young-adults" className={styles.courseSection}>
                <div className="container">
                    <div className={`${styles.courseGrid} ${styles.reversed}`}>
                        <div className={styles.courseInfo}>
                            <h2>Young Adults Cooking</h2>
                            <p className={styles.courseDesc}>
                                Thinking about the next step? Our weekend sessions build essential
                                cooking skills for life. Learn to cook nutritious, budget-friendly
                                meals in a relaxed, social setting.
                            </p>

                            <div className={styles.detailGrid}>
                                <div className={styles.detail}><Clock size={20} strokeWidth={1.5} /><div><strong>Time</strong><span>Sat & Sun, 10:30 am</span></div></div>
                                <div className={styles.detail}><Users size={20} strokeWidth={1.5} /><div><strong>Audience</strong><span>Young Adults</span></div></div>
                                <div className={styles.detail}><MapPin size={20} strokeWidth={1.5} /><div><strong>Location</strong><span>Multiple Venues</span></div></div>
                                <div className={styles.detail}><Shield size={20} strokeWidth={1.5} /><div><strong>Independence</strong><span>Self-Signup</span></div></div>
                            </div>

                            <div className={styles.includes}>
                                <h4>What's Included</h4>
                                <ul>
                                    {['All ingredients', 'Life-skills focus', 'Budget recipes', 'Relaxed session', 'Modern kitchen', 'Allergen aware'].map(i => (
                                        <li key={i}><CheckCircle size={16} strokeWidth={1.5} />{i}</li>
                                    ))}
                                </ul>
                            </div>

                            <div className={styles.bookingNote}>
                                <strong>📅 Independent Booking</strong>
                                <p>Register your own account and book weekend sessions independently. No parent account needed.</p>
                            </div>

                            <Link href="/portal/find-class?type=youngAdultWeekend" className="btn btn-primary btn-lg">
                                Book a Weekend Session
                            </Link>
                        </div>
                        <div className={styles.courseVisual}>
                            <div className={styles.courseEmoji}>🎓</div>
                            <div className={styles.courseTag}>Young Adults</div>
                        </div>
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
        </>
    );
}
