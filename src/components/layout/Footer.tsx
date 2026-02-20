import Link from 'next/link';
import { ChefHat, Youtube, Facebook, Instagram, Linkedin, Mail, Phone } from 'lucide-react';
import styles from './Footer.module.css';

export default function Footer() {
    return (
        <footer className={styles.footer}>
            <div className={`container ${styles.inner}`}>
                {/* Brand */}
                <div className={styles.brand}>
                    <div className={styles.logo}>
                        <ChefHat size={24} />
                        <span>Blooming Tastebuds</span>
                    </div>
                    <p>Inspiring a love of cooking in children and young adults through fun, hands-on sessions in a safe and supportive environment.</p>
                    <div className={styles.socials}>
                        <a href="https://www.youtube.com/@bloomingtastebuds" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><Youtube size={20} /></a>
                        <a href="https://www.facebook.com/nishavadhel4" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><Facebook size={20} /></a>
                        <a href="https://www.instagram.com/blooming_tastebuds/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><Instagram size={20} /></a>
                        <a href="https://www.linkedin.com/in/nisha-vadhel-a55a121a0/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><Linkedin size={20} /></a>
                    </div>
                </div>

                {/* Quick Links */}
                <div className={styles.col}>
                    <h4>Quick Links</h4>
                    <ul>
                        <li><Link href="/">Home</Link></li>
                        <li><Link href="/about">About Us</Link></li>
                        <li><Link href="/courses">Courses</Link></li>
                        <li><Link href="/gallery">Gallery</Link></li>
                        <li><Link href="/terms">Terms & Conditions</Link></li>
                    </ul>
                </div>

                {/* Classes */}
                <div className={styles.col}>
                    <h4>Our Classes</h4>
                    <ul>
                        <li><Link href="/courses#kids">After School Club (Ages 5–12)</Link></li>
                        <li><Link href="/courses#young-adults">Weekend Classes (Young Adults)</Link></li>
                        <li><Link href="/auth/signup">Register Now</Link></li>
                        <li><Link href="/portal/find-class">Find a Class</Link></li>
                    </ul>
                </div>

                {/* Contact */}
                <div className={styles.col}>
                    <h4>Get in Touch</h4>
                    <ul>
                        <li>
                            <a href="mailto:bloomingtastebuds@gmail.com">
                                <Mail size={14} />
                                bloomingtastebuds@gmail.com
                            </a>
                        </li>
                        <li>
                            <a href="tel:+447809722517">
                                <Phone size={14} />
                                +44 7809 722 517
                            </a>
                        </li>
                    </ul>
                </div>
            </div>

            <div className={styles.bottom}>
                <div className="container">
                    <p>© {new Date().getFullYear()} Blooming Tastebuds. All rights reserved.</p>
                    <p>Registered in England & Wales</p>
                </div>
            </div>
        </footer>
    );
}
