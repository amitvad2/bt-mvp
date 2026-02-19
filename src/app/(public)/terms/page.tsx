import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'Terms & Conditions | Blooming Tastebuds',
    description: 'The legal terms and conditions for booking and participating in Blooming Tastebuds cooking classes.',
};

export default function TermsPage() {
    const lastUpdated = 'February 2026';

    return (
        <>
            <section className={styles.hero}>
                <div className="container">
                    <span className="eyebrow">Legal</span>
                    <h1>Terms & Conditions</h1>
                    <p>Last updated: {lastUpdated}</p>
                </div>
            </section>

            <section className={`section ${styles.content}`}>
                <div className="container-sm">
                    <div className={styles.toc}>
                        <h3>Contents</h3>
                        <ol>
                            <li><a href="#acceptance">Acceptance of Terms</a></li>
                            <li><a href="#services">Our Services</a></li>
                            <li><a href="#booking">Booking & Payment</a></li>
                            <li><a href="#cancellation">Cancellation Policy</a></li>
                            <li><a href="#medical">Medical Information & Safety</a></li>
                            <li><a href="#conduct">Code of Conduct</a></li>
                            <li><a href="#liability">Limitation of Liability</a></li>
                            <li><a href="#privacy">Privacy & Data</a></li>
                            <li><a href="#changes">Changes to Terms</a></li>
                            <li><a href="#contact">Contact Us</a></li>
                        </ol>
                    </div>

                    <div className={styles.body}>
                        <section id="acceptance">
                            <h2>1. Acceptance of Terms</h2>
                            <p>By registering for an account with Blooming Tastebuds and booking any of our cooking sessions, you agree to be bound by these Terms and Conditions. Please read them carefully before completing your registration or booking.</p>
                            <p>These Terms apply to all users of the Blooming Tastebuds platform, including parents and guardians booking on behalf of children, and young adults booking for themselves.</p>
                        </section>

                        <section id="services">
                            <h2>2. Our Services</h2>
                            <p>Blooming Tastebuds provides cooking classes for children aged 5–12 (After School Club) and young adults (Weekend Classes). All sessions are booked on a per-session basis — there is no term-long commitment required.</p>
                            <p>Session details, including venue, date, time, instructor, and recipe, are displayed at the time of booking. We reserve the right to make reasonable changes to session details where necessary, and will notify registered participants of any significant changes.</p>
                            <p>We reserve the right to cancel a session due to insufficient bookings, instructor unavailability, or circumstances beyond our control. In such cases, a full refund will be issued.</p>
                        </section>

                        <section id="booking">
                            <h2>3. Booking & Payment</h2>
                            <p>All bookings must be made through the Blooming Tastebuds online portal. Bookings are confirmed only upon successful payment.</p>
                            <p>Payments are processed securely via Stripe. We accept major debit and credit cards. All prices are displayed in GBP (£) and are inclusive of VAT where applicable.</p>
                            <p>A booking confirmation will be sent to the email address registered on your account. Please retain this for your records.</p>
                            <p>Blooming Tastebuds does not store your full card details. All payment data is handled securely by Stripe in accordance with PCI DSS standards.</p>
                        </section>

                        <section id="cancellation">
                            <h2>4. Cancellation Policy</h2>
                            <p><strong>Cancellations by you:</strong> You may cancel a booking up to 48 hours before the session start time for a full refund. Cancellations made within 48 hours of the session are non-refundable, except in exceptional circumstances at our discretion.</p>
                            <p><strong>Cancellations by us:</strong> If Blooming Tastebuds cancels a session, you will receive a full refund to your original payment method within 5–10 business days.</p>
                            <p>To cancel a booking, please log into your portal and navigate to "My Classes". Cancellations cannot be processed by email or phone.</p>
                        </section>

                        <section id="medical">
                            <h2>5. Medical Information & Safety</h2>
                            <p>For the safety of all participants, we collect medical information as part of the booking process. This includes details of allergies, medical conditions, and additional support needs.</p>
                            <p>It is the responsibility of the parent, guardian, or participant to provide accurate and up-to-date medical information. Blooming Tastebuds cannot be held responsible for incidents arising from incomplete or inaccurate information provided at the time of booking.</p>
                            <p>All instructors are DBS-checked and trained in basic first aid. We operate allergen-aware kitchens, but we cannot guarantee a completely allergen-free environment. Please ensure you have disclosed all relevant allergies and medical conditions.</p>
                            <p>In the event of a medical emergency, we will contact the emergency contact provided at the time of booking. For children's sessions, a parent or guardian must be contactable throughout the session.</p>
                        </section>

                        <section id="conduct">
                            <h2>6. Code of Conduct</h2>
                            <p>We expect all participants to treat instructors and fellow students with respect. Blooming Tastebuds reserves the right to remove any participant from a session — without refund — if their behaviour is deemed unsafe, disruptive, or disrespectful.</p>
                            <p>Children must be collected promptly at the end of each session. Blooming Tastebuds cannot accept responsibility for children after the session has ended and the parent or guardian has not arrived.</p>
                        </section>

                        <section id="liability">
                            <h2>7. Limitation of Liability</h2>
                            <p>Blooming Tastebuds takes all reasonable steps to ensure the safety and wellbeing of participants. However, to the fullest extent permitted by law, we shall not be liable for any loss, injury, or damage arising from participation in our sessions, except where caused by our negligence.</p>
                            <p>Our total liability to you in connection with any booking shall not exceed the amount paid for that booking.</p>
                        </section>

                        <section id="privacy">
                            <h2>8. Privacy & Data</h2>
                            <p>We collect and process personal data in accordance with our Privacy Policy and applicable data protection legislation, including the UK GDPR. Medical information is collected solely for the purpose of ensuring participant safety and is not shared with third parties except where required by law or in a medical emergency.</p>
                            <p>You have the right to access, correct, or request deletion of your personal data at any time. Please contact us at hello@bloomingtastebuds.com to exercise these rights.</p>
                        </section>

                        <section id="changes">
                            <h2>9. Changes to Terms</h2>
                            <p>Blooming Tastebuds reserves the right to update these Terms and Conditions at any time. We will notify registered users of significant changes by email. Continued use of the platform following notification of changes constitutes acceptance of the updated Terms.</p>
                        </section>

                        <section id="contact">
                            <h2>10. Contact Us</h2>
                            <p>If you have any questions about these Terms and Conditions, please contact us:</p>
                            <ul>
                                <li><strong>Email:</strong> hello@bloomingtastebuds.com</li>
                                <li><strong>Phone:</strong> +44 (0) 1234 567 890</li>
                                <li><strong>Address:</strong> Blooming Tastebuds, England, United Kingdom</li>
                            </ul>
                            <p>Blooming Tastebuds is registered in England & Wales.</p>
                        </section>
                    </div>
                </div>
            </section>
        </>
    );
}
