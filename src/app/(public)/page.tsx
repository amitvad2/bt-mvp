import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Star, Sparkles, Heart, BookOpen, Shield, Flame, Leaf } from 'lucide-react';
import styles from './page.module.css';
import SessionMapSection from '@/components/home/SessionMapSection';

export const metadata: Metadata = {
    title: 'Blooming Tastebuds | Kids & Young Adult Cooking Classes',
    description: 'Empowering children and young adults through the magic of healthy cooking. Book your session today at one of our London venues.',
};

export default function HomePage() {
    return (
        <>
            {/* ── HERO ── */}
            <section className={styles.hero}>
                <div className={styles.heroBg}></div>
                {/* Floating food emojis */}
                <div className={styles.floatingEmojis} aria-hidden="true">
                    <span className={styles.floater} style={{ left: '5%', animationDelay: '0s', animationDuration: '6s' }}>🥕</span>
                    <span className={styles.floater} style={{ left: '15%', animationDelay: '1s', animationDuration: '8s' }}>🍅</span>
                    <span className={styles.floater} style={{ left: '25%', animationDelay: '2s', animationDuration: '7s' }}>🥦</span>
                    <span className={styles.floater} style={{ left: '40%', animationDelay: '0.5s', animationDuration: '9s' }}>🌽</span>
                    <span className={styles.floater} style={{ left: '55%', animationDelay: '3s', animationDuration: '6.5s' }}>🍋</span>
                    <span className={styles.floater} style={{ left: '70%', animationDelay: '1.5s', animationDuration: '7.5s' }}>🫑</span>
                    <span className={styles.floater} style={{ left: '85%', animationDelay: '2.5s', animationDuration: '8.5s' }}>🍊</span>
                    <span className={styles.floater} style={{ left: '92%', animationDelay: '0.8s', animationDuration: '6.8s' }}>🧁</span>
                </div>
                <div className={`container ${styles.heroContent}`}>
                    <div className={styles.heroBadge}>
                        <Sparkles size={16} /> London&apos;s Favourite Kids Cooking School
                    </div>
                    <h1 className={styles.heroTitle}>
                        Welcome to<br />
                        <span className={styles.heroGradient}>Blooming Tastebuds</span>
                    </h1>
                    <p className={styles.heroSub}>
                        Where kids and teens learn confidence, creativity, and conscious eating — one delicious meal at a time. 🌱
                    </p>
                    <div className={styles.heroCtas}>
                        <Link href="/portal/find-class" className={styles.ctaPrimary}>
                            <Flame size={20} /> Book a Class
                        </Link>
                        <Link href="/auth/signup" className={styles.ctaSecondary}>
                            Register Free <ArrowRight size={18} />
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── CREDIBILITY STRIP ── */}
            <div className={styles.credibilityStrip}>
                <div className={styles.marquee}>
                    <div className={styles.marqueeInner}>
                        <span>🌱 100% Vegetarian</span>
                        <span>👩‍🍳 Hands-on Learning</span>
                        <span>🔬 Kitchen Science</span>
                        <span>🎓 200+ Students Skilled</span>
                        <span>🛡️ DBS Certified</span>
                        <span>🌱 100% Vegetarian</span>
                        <span>👩‍🍳 Hands-on Learning</span>
                        <span>🔬 Kitchen Science</span>
                        <span>🎓 200+ Students Skilled</span>
                        <span>🛡️ DBS Certified</span>
                    </div>
                </div>
            </div>

            {/* ── EMPOWERING SECTION ── */}
            <section className={styles.empowerSection}>
                <div className="container">
                    <h2 className={styles.empowerTitle}>
                        Empowering Young Minds Through the<br />
                        <span className={styles.highlightText}>Joy of Homecooking</span>
                    </h2>
                    <p className={styles.empowerSub}>
                        Discover the joy of cooking with easy-to-learn recipes and techniques. Build essential life skills, boost your confidence in the kitchen, and have fun along the way.
                    </p>
                </div>
            </section>

            {/* ── NURTURING COOKS ── */}
            <section className={styles.nurturingSection}>
                <div className={`container ${styles.nurturingGrid}`}>
                    <div className={styles.nurturingImageWrap}>
                        <img src="/images/nurturing-cooks.JPG" alt="Instructor cooking" className={styles.nurturingImage} />
                        <div className={styles.imageBubble}>
                            <span>200+</span>
                            <small>Happy Students</small>
                        </div>
                    </div>
                    <div className={styles.nurturingCard}>
                        <div className={styles.nurturingBadge}>
                            <Heart size={16} /> Our Story
                        </div>
                        <h2>Nurturing Confident Cooks</h2>
                        <p className={styles.nurturingSubhead}>Cooking adventures for kids and teens</p>
                        <p>
                            At Blooming Tastebuds, we inspire young minds to explore the joys of healthy cooking. Our passionate Cooking Instructor brings over 2 years of experience in teaching school students how to whip up delicious and nutritious vegetarian dishes.
                        </p>
                        <p>
                            Through dynamic cooking sessions and hands-on learning, we foster essential life skills, culinary confidence, and creativity in each child. Join us in cultivating independence and healthier lifestyles, paving the way for future chefs to bloom!
                        </p>
                        <Link href="/about" className={styles.learnMoreLink}>
                            Get in touch <ArrowRight size={16} />
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── FIND A CLASS (Map Section) ── */}
            <SessionMapSection />

            {/* ── CHOOSE YOUR JOURNEY ── */}
            <section className={styles.journeySection}>
                <div className="container">
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionEyebrow}>🎯 Classes for Every Age</span>
                        <h2>Choose your cooking journey</h2>
                    </div>

                    <div className={styles.journeyGrid}>
                        {/* Kids Track */}
                        <div className={`${styles.journeyCard} ${styles.kidsCard}`}>
                            <div className={styles.journeyImageWrap}>
                                <img src="/images/kids-cooking.png" alt="Kids Cooking Class" className={styles.journeyImage} />
                                <div className={styles.ageBubble}>Ages 5–11</div>
                            </div>
                            <div className={styles.journeyContent}>
                                <h3>🍳 Little Chefs After-School Club</h3>
                                <p>A fun, safe, and messy introduction to healthy cooking! Kids learn essential kitchen safety, basic tools, and the joy of preparing fresh vegetarian food.</p>
                                <ul className={styles.featureChips}>
                                    <li>Build confidence</li>
                                    <li>Try new veggies</li>
                                    <li>Teamwork</li>
                                </ul>
                                <Link href="/portal/find-class?type=kidsAfterSchool" className={styles.cardCta}>
                                    Find Kids Classes <ArrowRight size={16} />
                                </Link>
                            </div>
                        </div>

                        {/* Young Adults Track */}
                        <div className={`${styles.journeyCard} ${styles.teensCard}`}>
                            <div className={styles.journeyImageWrap}>
                                <img src="/images/teen-cooking.png" alt="Teen Cooking Workshop" className={styles.journeyImage} />
                                <div className={`${styles.ageBubble} ${styles.ageBubbleTeen}`}>Ages 12+</div>
                            </div>
                            <div className={styles.journeyContent}>
                                <h3>🔥 Weekend Workshops</h3>
                                <p>Master real-world cooking skills designed for independence. From knife skills to cooking on a budget — get ready for life beyond the family kitchen.</p>
                                <ul className={styles.featureChips}>
                                    <li>Duke of Edinburgh</li>
                                    <li>Knife skills</li>
                                    <li>Budget meals</li>
                                </ul>
                                <Link href="/portal/find-class?type=youngAdultWeekend" className={`${styles.cardCta} ${styles.cardCtaTeen}`}>
                                    Find Teen Workshops <ArrowRight size={16} />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── WHAT THEY LEARN ── */}
            <section className={styles.learnSection}>
                <div className="container">
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionEyebrow}>📚 The Syllabus</span>
                        <h2>What they&apos;ll learn</h2>
                    </div>
                    <div className={styles.learnGrid}>
                        {[
                            { icon: <Shield size={32} />, title: 'Safe Knife Skills', desc: 'Age-appropriate techniques for confident, safe cutting', color: '#4CAF50' },
                            { icon: <Sparkles size={32} />, title: 'Kitchen Hygiene', desc: 'Clean habits that become second nature', color: '#FF8A65' },
                            { icon: <Leaf size={32} />, title: 'Nutrition Basics', desc: 'Understanding food groups and balanced meals', color: '#FFCA28' },
                            { icon: <Heart size={32} />, title: 'Mindful Eating', desc: 'Appreciating flavours and eating with intention', color: '#BA68C8' },
                        ].map((item) => (
                            <div key={item.title} className={styles.learnCard}>
                                <div className={styles.learnIcon} style={{ background: `${item.color}20`, color: item.color }}>
                                    {item.icon}
                                </div>
                                <h4>{item.title}</h4>
                                <p>{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section className={styles.howSection}>
                <div className="container">
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionEyebrow}>🧑‍🍳 How a Session Works</span>
                        <h2>Simple as a recipe</h2>
                    </div>
                    <div className={styles.stepsGrid}>
                        {[
                            { emoji: '📋', n: '1', title: 'Register', desc: 'Create your free account in under 2 minutes.' },
                            { emoji: '🔍', n: '2', title: 'Find', desc: 'Pick the perfect class, date & location.' },
                            { emoji: '💳', n: '3', title: 'Book', desc: 'Secure your spot with easy online payment.' },
                            { emoji: '👨‍🍳', n: '4', title: 'Cook!', desc: 'Show up, get messy, and start creating!' },
                        ].map((s) => (
                            <div key={s.n} className={styles.stepCard}>
                                <div className={styles.stepEmoji}>{s.emoji}</div>
                                <div className={styles.stepNum}>Step {s.n}</div>
                                <h4>{s.title}</h4>
                                <p>{s.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── TESTIMONIALS ── */}
            <section className={styles.testimonialsSection}>
                <div className="container">
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionEyebrow}>💬 Reviews</span>
                        <h2>Loved by parents and kids</h2>
                    </div>
                    <div className={styles.testimonialGrid}>
                        <div className={styles.testimonialCard}>
                            <div className={styles.stars}>
                                {[...Array(5)].map((_, i) => <Star key={i} size={18} fill="currentColor" />)}
                            </div>
                            <p className={styles.quote}>
                                &quot;Nisha has been an exceptional cooking teacher, demonstrating professionalism, dedication, and a passion for teaching. She communicates effectively, simplifies complex cooking techniques, and delivers engaging lessons. Her innovative methods and ability to inspire a love for culinary arts have made a lasting impact on our school community.&quot;
                            </p>
                            <div className={styles.testimonialAuthor}>
                                <strong>Academy Review</strong>
                                <span>Enrichment Lead, Ark Elvin Academy</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── FOUNDER SPOTLIGHT ── */}
            <section className={styles.founderSection}>
                <div className={`container ${styles.founderGrid}`}>
                    <div className={styles.founderImageCol}>
                        <div className={styles.founderImageFrame}>
                            <img src="/images/nurturing-cooks.JPG" alt="Nisha Vadhel — Founder" className={styles.founderImage} />
                        </div>
                    </div>
                    <div className={styles.founderText}>
                        <span className={styles.sectionEyebrow}>👩‍🍳 Meet the Founder</span>
                        <h2>Nisha Vadhel</h2>
                        <p>
                            With over 2 years teaching cooking at Ark Elvin Academy and leading sessions at Fun Fest holiday club, Nisha is passionate about equipping young minds with essential culinary and life skills.
                        </p>
                        <p>
                            Currently working with Smart Raspberry after-school cooking club for children aged 5–10, she also volunteers with Bags of Taste and other community organizations.
                        </p>
                        <Link href="/about" className={styles.ctaPrimary} style={{ alignSelf: 'flex-start' }}>
                            <BookOpen size={18} /> Read Full Bio
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── CTA BANNER ── */}
            <section className={styles.ctaBanner}>
                <div className="container">
                    <div className={styles.ctaBannerInner}>
                        <h2>Ready to start cooking? 🍽️</h2>
                        <p>Join hundreds of London families who&apos;ve discovered the joy of healthy homecooking.</p>
                        <div className={styles.heroCtas}>
                            <Link href="/auth/signup" className={styles.ctaPrimary}>
                                Register Now <ArrowRight size={18} />
                            </Link>
                            <Link href="/portal/find-class" className={styles.ctaSecondary}>
                                Explore Classes
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
