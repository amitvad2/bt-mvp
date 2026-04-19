import Link from 'next/link';
import { HelpCircle, Mail, BookOpen, CreditCard, Users, User, MessageCircle, ChevronRight } from 'lucide-react';
import styles from './page.module.css';

export default function SupportPage() {
    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1>Support & Help</h1>
                <p>Find answers to common questions or get in touch with the Blooming Tastebuds team.</p>
            </div>

            <div className={styles.layout}>
                {/* Contact card */}
                <div className={`card ${styles.contactCard}`}>
                    <div className={styles.contactIcon}>
                        <Mail size={28} />
                    </div>
                    <h3>Get in Touch</h3>
                    <p>
                        Can&apos;t find what you&apos;re looking for? Our team is happy to help with bookings,
                        payments, allergies, or anything else.
                    </p>
                    <Link href="/contact" className="btn btn-primary">
                        <MessageCircle size={16} /> Send a Message
                    </Link>
                    <p className={styles.emailNote}>
                        Or email us directly at{' '}
                        <a href="mailto:bloomingtastebuds@gmail.com">bloomingtastebuds@gmail.com</a>
                    </p>
                </div>

                {/* Quick links */}
                <div className={`card ${styles.quickLinksCard}`}>
                    <h3>Quick Links</h3>
                    <p className={styles.subText}>Jump to the section you need.</p>
                    <ul className={styles.linkList}>
                        <li>
                            <Link href="/portal/my-classes">
                                <BookOpen size={18} />
                                <span>My Classes</span>
                                <ChevronRight size={16} className={styles.chevron} />
                            </Link>
                        </li>
                        <li>
                            <Link href="/portal/my-payments">
                                <CreditCard size={18} />
                                <span>My Payments</span>
                                <ChevronRight size={16} className={styles.chevron} />
                            </Link>
                        </li>
                        <li>
                            <Link href="/portal/my-students">
                                <Users size={18} />
                                <span>My Students</span>
                                <ChevronRight size={16} className={styles.chevron} />
                            </Link>
                        </li>
                        <li>
                            <Link href="/portal/account">
                                <User size={18} />
                                <span>Account Settings</span>
                                <ChevronRight size={16} className={styles.chevron} />
                            </Link>
                        </li>
                        <li>
                            <Link href="/portal/find-class">
                                <HelpCircle size={18} />
                                <span>Find a Class</span>
                                <ChevronRight size={16} className={styles.chevron} />
                            </Link>
                        </li>
                    </ul>
                </div>

                {/* FAQ */}
                <div className={`card ${styles.faqCard}`}>
                    <h3>Common Questions</h3>

                    <div className={styles.faqList}>
                        <details className={styles.faqItem}>
                            <summary>How do I book a class for my child?</summary>
                            <p>
                                Go to <Link href="/portal/find-class">Find a Class</Link>, choose a session,
                                then follow the booking wizard. You&apos;ll need to select a student profile (or
                                create one under <Link href="/portal/my-students">My Students</Link>) and
                                complete payment via Stripe.
                            </p>
                        </details>

                        <details className={styles.faqItem}>
                            <summary>Can I get a refund?</summary>
                            <p>
                                Refunds are handled on a case-by-case basis. Please{' '}
                                <Link href="/contact">contact us</Link> with your booking reference and we&apos;ll
                                review your request. Refunds are processed back to your original payment method
                                via Stripe and typically take 5–10 business days.
                            </p>
                        </details>

                        <details className={styles.faqItem}>
                            <summary>I paid but my booking isn&apos;t showing up.</summary>
                            <p>
                                Bookings are confirmed by our payment processor within a few minutes of payment.
                                Check <Link href="/portal/my-classes">My Classes</Link> after a short wait and
                                refresh the page. If your booking still isn&apos;t listed after 10 minutes,
                                please <Link href="/contact">contact us</Link> with your payment confirmation
                                email so we can investigate.
                            </p>
                        </details>

                        <details className={styles.faqItem}>
                            <summary>How do I add or edit a student profile?</summary>
                            <p>
                                Visit <Link href="/portal/my-students">My Students</Link> to add a new profile or
                                update an existing one. Each student can have their own medical and emergency
                                contact information, which is pre-filled during booking.
                            </p>
                        </details>

                        <details className={styles.faqItem}>
                            <summary>What if my child has a food allergy?</summary>
                            <p>
                                All classes are allergy-aware and vegetarian. You can record allergy and medical
                                information in your student&apos;s profile under{' '}
                                <Link href="/portal/my-students">My Students</Link>. This information is shared
                                with the class instructor before each session. For severe allergies, please also{' '}
                                <Link href="/contact">contact us</Link> directly.
                            </p>
                        </details>

                        <details className={styles.faqItem}>
                            <summary>How do I change my account email or password?</summary>
                            <p>
                                Email changes require identity verification — please{' '}
                                <Link href="/contact">contact us</Link> and we&apos;ll help you. To reset your
                                password, sign out and use the &quot;Forgot password?&quot; link on the login page.
                            </p>
                        </details>
                    </div>
                </div>
            </div>
        </div>
    );
}
