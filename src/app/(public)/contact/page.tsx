import type { Metadata } from 'next';
import { Mail, Phone, Clock, MapPin } from 'lucide-react';
import styles from './page.module.css';
import ContactForm from './ContactForm';

export const metadata: Metadata = {
    title: 'Contact Us | Blooming Tastebuds',
    description: 'Get in touch with Blooming Tastebuds — we welcome enquiries about classes, bookings, dietary needs, and school partnerships.',
};

export default function ContactPage() {
    return (
        <>
            {/* Hero */}
            <section className={styles.hero}>
                <div className="container">
                    <span className="eyebrow">Get in Touch</span>
                    <h1>We'd Love to Hear From You</h1>
                    <p>Questions about classes, bookings, or anything else — send us a message and we'll get back to you.</p>
                </div>
            </section>

            {/* Main */}
            <section className={`section ${styles.content}`}>
                <div className="container">
                    <div className={styles.grid}>
                        {/* Form — heading/intro are rendered inside ContactForm so they update with submission state */}
                        <div className={`card ${styles.formCard}`}>
                            <ContactForm />
                        </div>

                        {/* Sidebar */}
                        <aside className={styles.sidebar}>
                            <div className={styles.sidebarCard}>
                                <h3>Contact Details</h3>
                                <ul className={styles.contactList}>
                                    <li>
                                        <Mail size={18} strokeWidth={1.5} />
                                        <a href="mailto:bloomingtastebuds@gmail.com">bloomingtastebuds@gmail.com</a>
                                    </li>
                                    <li>
                                        <Phone size={18} strokeWidth={1.5} />
                                        <a href="tel:+447809722517">+44 7809 722 517</a>
                                    </li>
                                    <li>
                                        <MapPin size={18} strokeWidth={1.5} />
                                        <span>Based in London, UK</span>
                                    </li>
                                    <li>
                                        <Clock size={18} strokeWidth={1.5} />
                                        <span>Mon – Fri, 9 am – 5 pm</span>
                                    </li>
                                </ul>
                            </div>

                            <div className={styles.sidebarCard}>
                                <h3>Common Questions</h3>
                                <ul className={styles.faqList}>
                                    {[
                                        { q: 'How quickly will you reply?', a: 'We aim to respond to all messages within 2 business days.' },
                                        { q: 'Can I book a private class?', a: 'Yes — select "Private event / school enquiry" and tell us about your group.' },
                                        { q: 'My child has an allergy — who do I tell?', a: 'Select "Dietary / allergy question" and give us the details. We review every submission carefully.' },
                                    ].map(f => (
                                        <li key={f.q}>
                                            <strong>{f.q}</strong>
                                            <p>{f.a}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </aside>
                    </div>
                </div>
            </section>
        </>
    );
}
