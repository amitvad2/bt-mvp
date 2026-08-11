'use client';

import { useState, useEffect, Fragment, useRef } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Session, BTClass, Recipe, Instructor, BTClassType, Booking, BookingSource } from '@/types';
import { Calendar, Plus, Edit2, Trash2, X, Clock, ChefHat, MapPin, UserCheck, ClipboardList, Link as LinkIcon, MessageCircle, Share2, AlertTriangle } from 'lucide-react';
import { isGuestCheckoutEnabled } from '@/lib/feature-flags';
import { generateSchedule, generateScheduleMultiDay, validateTermDates } from '@/lib/term-schedule-utils';
import TermScheduleEditor from './TermScheduleEditor';
import styles from './page.module.css';

// ============================================================
// Session Register — helper utilities
// ============================================================

/** Map BookingSource values to user-friendly display labels */
function getSourceLabel(source?: BookingSource): string {
    switch (source) {
        case 'whatsapp_express': return 'WhatsApp';
        case 'facebook_express': return 'Messenger';
        case 'instagram_express': return 'Instagram';
        case 'qr_express': return 'QR Code';
        case 'google_express': return 'Google';
        case 'website_express': return 'Website (Guest)';
        case 'website': return 'Website';
        case 'unknown': return 'Unknown';
        default: return '—';
    }
}

/** Get badge colour class for a given booking source */
function getSourceBadgeClass(source?: BookingSource): string {
    switch (source) {
        case 'whatsapp_express': return 'badge-green';
        case 'facebook_express': return 'badge-indigo';
        case 'instagram_express': return 'badge-berry';
        case 'qr_express': return 'badge-citrus';
        case 'google_express': return 'badge-sky';
        case 'website_express': return 'badge-orange';
        case 'website': return 'badge-sky';
        default: return 'badge-gray';
    }
}

/** Derive participant (child/student) name for register display */
function getParticipantName(booking: Booking): string {
    // Guest bookings: use childSnapshot
    if (booking.bookingMode === 'guest' && booking.childSnapshot) {
        return `${booking.childSnapshot.firstName} ${booking.childSnapshot.lastName}`;
    }
    // Account bookings: use studentName
    return booking.studentName || '—';
}

/** Derive parent/booker name for register display */
function getParentName(booking: Booking): string {
    // Guest bookings: use guestContact
    if (booking.bookingMode === 'guest' && booking.guestContact) {
        return `${booking.guestContact.firstName} ${booking.guestContact.lastName}`;
    }
    // Account bookings: use bookedByName
    return booking.bookedByName || '—';
}

/** Calculate age from date of birth string (YYYY-MM-DD) relative to a session date */
function calculateAge(dateOfBirth: string, sessionDate: string): number | null {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    const refDate = sessionDate ? new Date(sessionDate) : new Date();
    if (isNaN(dob.getTime()) || isNaN(refDate.getTime())) return null;
    let age = refDate.getFullYear() - dob.getFullYear();
    const monthDiff = refDate.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && refDate.getDate() < dob.getDate())) {
        age--;
    }
    return age;
}

/** Get participant age for a booking */
function getParticipantAge(booking: Booking, sessionDate: string): number | null {
    // Guest bookings: use childSnapshot.dateOfBirth
    if (booking.bookingMode === 'guest' && booking.childSnapshot?.dateOfBirth) {
        return calculateAge(booking.childSnapshot.dateOfBirth, sessionDate);
    }
    // Account bookings: no direct DOB on booking, return null
    return null;
}

/** Check if booking has medical declarations worth flagging */
function hasMedicalFlag(booking: Booking): boolean {
    if (booking.bookingMode === 'guest' && booking.medicalSnapshot) {
        const m = booking.medicalSnapshot;
        return !!(
            m.foodAllergies ||
            m.epipenRequired ||
            m.respiratoryProblems ||
            m.airborneAllergies ||
            (m.medicalConditions && m.medicalConditions.trim().length > 0) ||
            m.visionImpairment ||
            m.hearingImpairment
        );
    }
    // Account bookings: check medicalInfo
    if (booking.medicalInfo) {
        const m = booking.medicalInfo;
        return !!(m.allergies || m.conditions || m.respiratoryProblems || m.visionImpairment || m.hearingImpairment);
    }
    return false;
}

/** Check if booking has emergency contact */
function hasEmergencyContact(booking: Booking): boolean {
    if (booking.bookingMode === 'guest') {
        return !!(booking.emergencyContactSnapshot?.name);
    }
    return !!(booking.emergencyContact?.name);
}

/** Get authorised collector name */
function getAuthorisedCollectorName(booking: Booking): string {
    if (booking.bookingMode === 'guest' && booking.authorisedCollectorSnapshot) {
        return booking.authorisedCollectorSnapshot.name || '—';
    }
    return '—';
}

/** Get medical details summary for the expanded detail row */
function getMedicalDetailsSummary(booking: Booking): string[] {
    const details: string[] = [];

    if (booking.bookingMode === 'guest' && booking.medicalSnapshot) {
        const m = booking.medicalSnapshot;
        if (m.foodAllergies) details.push('Food allergies');
        if (m.airborneAllergies) details.push('Airborne allergies');
        if (m.allergenDetails) details.push(`Allergens: ${m.allergenDetails}`);
        if (m.epipenRequired) details.push('EpiPen required' + (m.epipenDetails ? ` — ${m.epipenDetails}` : ''));
        if (m.respiratoryProblems) details.push('Respiratory problems');
        if (m.medicalConditions) details.push(`Conditions: ${m.medicalConditions}`);
        if (m.recentOperations) details.push(`Recent operations: ${m.recentOperations}`);
        if (m.visionImpairment) details.push('Vision impairment');
        if (m.hearingImpairment) details.push('Hearing impairment');
        if (m.additionalSupportNeeds) details.push(`Support needs: ${m.additionalSupportNeeds}`);
        if (m.medicationDetails) details.push(`Medication: ${m.medicationDetails}`);
        if (m.otherSafetyInfo) details.push(`Other: ${m.otherSafetyInfo}`);
        if (m.dietaryRequirements) details.push(`Dietary: ${m.dietaryRequirements}`);
    } else if (booking.medicalInfo) {
        const m = booking.medicalInfo;
        if (m.allergies) details.push('Has allergies');
        if (m.respiratoryProblems) details.push('Respiratory problems');
        if (m.conditions) details.push('Has medical conditions');
        if (m.recentOperations) details.push('Recent operations');
        if (m.visionImpairment) details.push('Vision impairment');
        if (m.hearingImpairment) details.push('Hearing impairment');
        if (m.additionalSupportNeeds) details.push(`Support needs: ${m.additionalSupportNeeds}`);
        if (m.otherMedicalNotes) details.push(`Notes: ${m.otherMedicalNotes}`);
    }

    // Also include allergy/dietary snapshot for guest bookings
    if (booking.bookingMode === 'guest' && booking.allergyDietarySnapshot) {
        const a = booking.allergyDietarySnapshot;
        if (a.foodAllergies?.length) details.push(`Food allergies: ${a.foodAllergies.join(', ')}`);
        if (a.dietaryRequirements?.length) details.push(`Dietary: ${a.dietaryRequirements.join(', ')}`);
        if (a.airborneAllergies?.length) details.push(`Airborne: ${a.airborneAllergies.join(', ')}`);
        if (a.reactionDetails) details.push(`Reactions: ${a.reactionDetails}`);
        if (a.symptoms) details.push(`Symptoms: ${a.symptoms}`);
    }

    // Include questionnaire dietary info for account bookings
    if (booking.questionnaire) {
        if (booking.questionnaire.dietaryRequirements) {
            details.push(`Dietary: ${booking.questionnaire.dietaryRequirements}`);
        }
        if (booking.questionnaire.airborneAllergy) {
            details.push(`Airborne allergy: ${booking.questionnaire.airborneAllergy}`);
        }
    }

    return details;
}

/** Get emergency contact details for the expanded detail row */
function getEmergencyContactDetails(booking: Booking): { name: string; relationship: string; phone: string; email?: string } | null {
    if (booking.bookingMode === 'guest' && booking.emergencyContactSnapshot) {
        const ec = booking.emergencyContactSnapshot;
        return {
            name: ec.name,
            relationship: ec.relationship,
            phone: ec.mobile || ec.alternativePhone || '—',
            email: ec.email || undefined,
        };
    }
    if (booking.emergencyContact) {
        const ec = booking.emergencyContact;
        return {
            name: ec.name,
            relationship: ec.relationship,
            phone: ec.phone || '—',
            email: ec.email || undefined,
        };
    }
    return null;
}

export default function AdminSessions() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [classes, setClasses] = useState<BTClass[]>([]);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [instructors, setInstructors] = useState<Instructor[]>([]);
    const [classTypes, setClassTypes] = useState<BTClassType[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingSession, setEditingSession] = useState<Session | null>(null);

    // Session Register state
    const [registerSession, setRegisterSession] = useState<Session | null>(null);
    const [registerBookings, setRegisterBookings] = useState<Booking[]>([]);
    const [registerLoading, setRegisterLoading] = useState(false);
    const [signInTimes, setSignInTimes] = useState<Record<string, string>>({});
    const [signOutTimes, setSignOutTimes] = useState<Record<string, string>>({});
    const [expandedDetailId, setExpandedDetailId] = useState<string | null>(null);

    // Guest link management
    const guestCheckoutEnabled = isGuestCheckoutEnabled();
    const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

    const handleCopyGuestLink = async (sessionId: string) => {
        const url = `${window.location.origin}/express-booking/${sessionId}?source=website_express`;
        await navigator.clipboard.writeText(url);
        setCopiedLinkId(`guest-${sessionId}`);
        setTimeout(() => setCopiedLinkId(null), 2000);
    };

    const handleCopyWhatsAppLink = async (session: Session) => {
        const guestUrl = `${window.location.origin}/express-booking/${session.id}?source=whatsapp_express`;
        const formattedDate = session.date
            ? new Date(session.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : '';
        const message = `Book your child into ${session.className} on ${formattedDate} — no account required! ${guestUrl}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        await navigator.clipboard.writeText(whatsappUrl);
        setCopiedLinkId(`whatsapp-${session.id}`);
        setTimeout(() => setCopiedLinkId(null), 2000);
    };

    // Social booking link generator state
    const [socialLinkSession, setSocialLinkSession] = useState<Session | null>(null);
    const [socialCampaignName, setSocialCampaignName] = useState('');
    const [socialCampaignError, setSocialCampaignError] = useState('');
    const [socialLinkCopied, setSocialLinkCopied] = useState(false);
    const [generatedSocialLink, setGeneratedSocialLink] = useState('');

    const CAMPAIGN_REGEX = /^[A-Za-z0-9_-]*$/;

    const handleOpenSocialLinkModal = (session: Session) => {
        setSocialLinkSession(session);
        setSocialCampaignName('');
        setSocialCampaignError('');
        setSocialLinkCopied(false);
        setGeneratedSocialLink('');
    };

    const handleCloseSocialLinkModal = () => {
        setSocialLinkSession(null);
        setSocialCampaignName('');
        setSocialCampaignError('');
        setSocialLinkCopied(false);
        setGeneratedSocialLink('');
    };

    const handleCampaignNameChange = (value: string) => {
        setSocialCampaignName(value);
        setSocialLinkCopied(false);
        setGeneratedSocialLink('');
        if (value && !CAMPAIGN_REGEX.test(value)) {
            setSocialCampaignError('Only letters, numbers, hyphens, and underscores allowed');
        } else if (value.length > 50) {
            setSocialCampaignError('Maximum 50 characters');
        } else {
            setSocialCampaignError('');
        }
    };

    const handleGenerateSocialLink = async () => {
        if (socialCampaignName && !CAMPAIGN_REGEX.test(socialCampaignName)) return;
        if (socialCampaignName.length > 50) return;

        // Generate direct guest booking link (no token needed)
        let url = `${window.location.origin}/express-booking/${socialLinkSession?.id || ''}?source=social_link`;
        if (socialCampaignName.trim()) {
            url += `&utm_campaign=${encodeURIComponent(socialCampaignName.trim())}`;
        }

        setGeneratedSocialLink(url);
        await navigator.clipboard.writeText(url);
        setSocialLinkCopied(true);
        setTimeout(() => setSocialLinkCopied(false), 3000);
    };

    // Session type toggle for create/edit modal
    const [sessionTypeToggle, setSessionTypeToggle] = useState<'single' | 'term'>('single');
    const [termFormData, setTermFormData] = useState({
        termStartDate: '',
        termEndDate: '',
        daysOfWeek: [] as string[],
        spotsTotal: 15,
        price: 1500,
        ageMin: 5,
        ageMax: 12,
        status: 'draft' as Session['status'],
    });
    const [termFormError, setTermFormError] = useState('');

    const [formData, setFormData] = useState({
        classId: '',
        title: '',
        date: '',
        recipeIds: [] as string[],
        instructorId: '',
        status: 'open' as Session['status'],
        spotsAvailable: 15,
        startTime: '',
        endTime: '',
    });
    const [recipeDropdownValue, setRecipeDropdownValue] = useState('');

    // Modal drag state
    const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const handleDragStart = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragOffset.current = { x: e.clientX - modalPos.x, y: e.clientY - modalPos.y };
    };

    useEffect(() => {
        if (!isDragging) return;
        const handleMove = (e: MouseEvent) => {
            setModalPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
        };
        const handleUp = () => setIsDragging(false);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [isDragging]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const sessionsSnap = await getDocs(query(collection(db, 'sessions'), orderBy('date', 'desc')));
                const classesSnap = await getDocs(collection(db, 'classes'));
                const recipesSnap = await getDocs(collection(db, 'recipes'));
                const instructorsSnap = await getDocs(collection(db, 'instructors'));
                const classTypesSnap = await getDocs(query(collection(db, 'class_types'), orderBy('order')));

                setSessions(sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Session)));
                setClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() } as BTClass)));
                setRecipes(recipesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe)));
                setInstructors(instructorsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Instructor)));
                setClassTypes(classTypesSnap.docs.map(d => ({ id: d.id, ...d.data() } as BTClassType)));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleOpenRegister = async (session: Session) => {
        setRegisterSession(session);
        setRegisterLoading(true);
        setSignInTimes({});
        setSignOutTimes({});
        try {
            // Always query per-session bookings
            const perSessionSnap = await getDocs(
                query(collection(db, 'bookings'), where('sessionId', '==', session.id))
            );
            const perSessionBookings = perSessionSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));

            // Check if the session belongs to a term/programme class
            const parentClass = classes.find(c => c.id === session.classId);
            let termBookings: Booking[] = [];
            if (parentClass?.commitment === 'term') {
                const termSnap = await getDocs(
                    query(
                        collection(db, 'bookings'),
                        where('classId', '==', session.classId),
                        where('bookingType', '==', 'term'),
                        where('status', '==', 'confirmed')
                    )
                );
                termBookings = termSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
            }

            // Merge and deduplicate by booking ID
            const bookingMap = new Map<string, Booking>();
            for (const b of perSessionBookings) {
                bookingMap.set(b.id, b);
            }
            for (const b of termBookings) {
                if (!bookingMap.has(b.id)) {
                    bookingMap.set(b.id, b);
                }
            }

            setRegisterBookings(Array.from(bookingMap.values()));
        } catch (e) {
            console.error('[SessionRegister]', e);
            setRegisterBookings([]);
        } finally {
            setRegisterLoading(false);
        }
    };

    const handleCloseRegister = () => {
        setRegisterSession(null);
        setRegisterBookings([]);
        setExpandedDetailId(null);
    };

    const handleOpenModal = (s?: Session) => {
        if (s) {
            setEditingSession(s);
            setSessionTypeToggle((s.sessionType ?? 'single') === 'term' ? 'term' : 'single');
            setFormData({
                classId: s.classId,
                title: s.title || '',
                date: s.date,
                recipeIds: s.recipeIds || (s.recipeId ? [s.recipeId] : []),
                instructorId: s.instructorId || '',
                status: s.status,
                spotsAvailable: s.spotsAvailable,
                startTime: s.startTime || '',
                endTime: s.endTime || '',
            });
            if ((s.sessionType ?? 'single') === 'term') {
                setTermFormData({
                    termStartDate: s.termStartDate || '',
                    termEndDate: s.termEndDate || '',
                    daysOfWeek: s.dayOfWeek ? [s.dayOfWeek] : (s as any).daysOfWeek || [],
                    spotsTotal: s.spotsTotal || 15,
                    price: s.price || 1500,
                    ageMin: s.ageMin || 5,
                    ageMax: s.ageMax || 12,
                    status: s.status || 'draft',
                });
            } else {
                setTermFormData({ termStartDate: '', termEndDate: '', daysOfWeek: [], spotsTotal: 15, price: 1500, ageMin: 5, ageMax: 12, status: 'draft' });
            }
        } else {
            setEditingSession(null);
            setSessionTypeToggle('single');
            setFormData({ classId: '', title: '', date: '', recipeIds: [], instructorId: '', status: 'open', spotsAvailable: 15, startTime: '', endTime: '' });
            setTermFormData({ termStartDate: '', termEndDate: '', daysOfWeek: [], spotsTotal: 15, price: 1500, ageMin: 5, ageMax: 12, status: 'draft' });
        }
        setTermFormError('');
        setRecipeDropdownValue('');
        setModalPos({ x: 0, y: 0 });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Handle term session creation
        if (sessionTypeToggle === 'term') {
            setTermFormError('');

            // Validate required fields
            if (!formData.classId) { setTermFormError('Please select a class'); return; }
            if (!termFormData.termStartDate) { setTermFormError('Term start date is required'); return; }
            if (!termFormData.termEndDate) { setTermFormError('Term end date is required'); return; }
            if (termFormData.daysOfWeek.length === 0) { setTermFormError('Please select at least one day of the week'); return; }
            if (!formData.startTime) { setTermFormError('Start time is required'); return; }
            if (!formData.endTime) { setTermFormError('End time is required'); return; }
            if (!formData.instructorId) { setTermFormError('Please select an instructor'); return; }

            // Cross-field validation — check each selected day
            for (const day of termFormData.daysOfWeek) {
                const validation = validateTermDates(termFormData.termStartDate, termFormData.termEndDate, day);
                if (!validation.valid) {
                    setTermFormError(validation.error || 'Invalid term dates');
                    return;
                }
            }

            // Generate schedule for all selected days (merged chronologically)
            // When editing, only regenerate if dates or days changed — otherwise preserve existing recipe assignments
            let schedule;
            if (editingSession && editingSession.schedule) {
                const datesChanged = termFormData.termStartDate !== editingSession.termStartDate ||
                    termFormData.termEndDate !== editingSession.termEndDate;
                const daysChanged = JSON.stringify(termFormData.daysOfWeek.sort()) !== JSON.stringify(
                    ((editingSession as any).daysOfWeek || (editingSession.dayOfWeek ? [editingSession.dayOfWeek] : [])).sort()
                );
                if (datesChanged || daysChanged) {
                    schedule = generateScheduleMultiDay(termFormData.termStartDate, termFormData.termEndDate, termFormData.daysOfWeek);
                } else {
                    schedule = editingSession.schedule; // Preserve existing schedule with recipe assignments
                }
            } else {
                schedule = generateScheduleMultiDay(termFormData.termStartDate, termFormData.termEndDate, termFormData.daysOfWeek);
            }

            const parentClass = classes.find(c => c.id === formData.classId);
            const instructor = instructors.find(i => i.id === formData.instructorId);
            const classType = classTypes.find(ct => ct.slug === parentClass?.type);

            const termData = {
                sessionType: 'term' as const,
                classId: formData.classId,
                className: parentClass?.name || classType?.displayName || parentClass?.type || 'Unknown',
                classType: parentClass?.type || '',
                venueId: parentClass?.venueId || '',
                venueName: parentClass?.venueName || '',
                instructorId: formData.instructorId,
                instructorName: instructor?.name || '',
                startTime: formData.startTime || parentClass?.startTime || '',
                endTime: formData.endTime || parentClass?.endTime || '',
                termStartDate: termFormData.termStartDate,
                termEndDate: termFormData.termEndDate,
                dayOfWeek: termFormData.daysOfWeek.join(', '),
                daysOfWeek: termFormData.daysOfWeek,
                schedule,
                price: termFormData.price,
                spotsTotal: termFormData.spotsTotal,
                spotsAvailable: editingSession ? (editingSession.spotsAvailable ?? termFormData.spotsTotal) : termFormData.spotsTotal,
                ageMin: termFormData.ageMin,
                ageMax: termFormData.ageMax,
                status: termFormData.status,
                // Backward-compatible fields
                date: termFormData.termStartDate, // For sorting
                recipeId: '',
                recipeName: '',
                recipePhotoUrl: '',
                updatedAt: serverTimestamp(),
            };

            try {
                if (editingSession) {
                    await updateDoc(doc(db, 'sessions', editingSession.id), termData);
                    setSessions(prev => prev.map(s => s.id === editingSession.id ? { ...s, ...termData } as unknown as Session : s));
                } else {
                    const docRef = await addDoc(collection(db, 'sessions'), { ...termData, createdAt: serverTimestamp() });
                    setSessions(prev => [{ id: docRef.id, ...termData, createdAt: new Date() } as unknown as Session, ...prev]);
                }
                setShowModal(false);
            } catch (err) {
                console.error(err);
                alert('Error saving term session.');
            }
            return;
        }

        // Existing single session submit logic
        const parentClass = classes.find(c => c.id === formData.classId);
        const selectedRecipes = recipes.filter(r => formData.recipeIds.includes(r.id));
        const firstRecipe = selectedRecipes[0];
        const instructor = instructors.find(i => i.id === formData.instructorId);
        const classType = classTypes.find(ct => ct.slug === parentClass?.type);

        // Aggregate skills from all selected recipes
        const aggregatedSkills = Array.from(new Set(selectedRecipes.flatMap(r => r.skills || [])));

        const data = {
            classId: formData.classId,
            title: formData.title,
            date: formData.date,
            instructorId: formData.instructorId,
            status: formData.status,
            spotsAvailable: formData.spotsAvailable,
            startTime: formData.startTime || parentClass?.startTime || '',
            endTime: formData.endTime || parentClass?.endTime || '',
            className: parentClass?.name || classType?.displayName || parentClass?.type || 'Unknown',
            classType: parentClass?.type || '',
            venueId: parentClass?.venueId || '',
            venueName: parentClass?.venueName || '',
            // Legacy single-recipe fields (backward compat)
            recipeId: firstRecipe?.id || '',
            recipeName: firstRecipe?.name || '',
            recipePhotoUrl: firstRecipe?.photoUrl || '',
            // New multi-recipe field
            recipeIds: formData.recipeIds,
            // Skills aggregated from selected recipes
            skills: aggregatedSkills,
            instructorName: instructor?.name || '',
            price: parentClass?.price || 1500,
            spotsTotal: parentClass?.maxSize || 15,
            ageMin: parentClass?.ageMin || 5,
            ageMax: parentClass?.ageMax || 12,
            updatedAt: serverTimestamp(),
        };

        try {
            if (editingSession) {
                await updateDoc(doc(db, 'sessions', editingSession.id), data);
                setSessions(prev => prev.map(s => s.id === editingSession.id ? { ...s, ...data } as Session : s));
            } else {
                const docRef = await addDoc(collection(db, 'sessions'), { ...data, createdAt: serverTimestamp() });
                setSessions(prev => [{ id: docRef.id, ...data, createdAt: new Date() } as Session, ...prev]);
            }
            setShowModal(false);
        } catch (e) {
            console.error(e);
            alert('Error saving session.');
        }
    };

    const handleDelete = async (session: Session) => {
        try {
            // Check if any bookings are linked to this session
            const bookingsSnap = await getDocs(
                query(collection(db, 'bookings'), where('sessionId', '==', session.id), where('status', '==', 'confirmed'))
            );
            const bookingCount = bookingsSnap.size;

            const confirmMsg = bookingCount > 0
                ? `⚠️ This session has ${bookingCount} confirmed booking${bookingCount > 1 ? 's' : ''}. Deleting it will NOT automatically cancel or refund those bookings. Are you sure you want to delete it?`
                : 'Delete this session? This cannot be undone.';

            if (!confirm(confirmMsg)) return;

            await deleteDoc(doc(db, 'sessions', session.id));
            setSessions(prev => prev.filter(s => s.id !== session.id));
        } catch (e: any) {
            console.error('[SessionDelete]', e);
            if (e?.code === 'permission-denied') {
                alert('Permission denied. You do not have access to delete this session.');
            } else {
                alert(`Failed to delete session: ${e?.message || 'Unknown error'}. Please try again.`);
            }
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>Session Dates</h1>
                    <p>Schedule and manage individual class sessions.</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    Add Session
                </button>
            </div>

            {loading ? (
                <div className="spinner" />
            ) : (
                <div className={styles.tableCard}>
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Class</th>
                                <th>Recipe</th>
                                <th>Venue</th>
                                <th>Spots</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessions.map(s => {
                                const parentClass = classes.find(c => c.id === s.classId);
                                const isTermClass = parentClass?.commitment === 'term';
                                // Absent/undefined sessionType defaults to 'single' (backward compat)
                                const isTermSession = (s.sessionType ?? 'single') === 'term';
                                return (
                                <tr key={s.id}>
                                    <td>
                                        {isTermSession && s.termStartDate && s.termEndDate ? (
                                            <strong>
                                                {new Date(s.termStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                                {' – '}
                                                {new Date(s.termEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </strong>
                                        ) : (
                                            <strong>{s.date ? new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</strong>
                                        )}
                                    </td>
                                    <td>
                                        {(() => {
                                            const ct = classTypes.find(t => t.slug === s.classType);
                                            return (
                                                <>
                                                    <span className={`badge badge-${ct?.badgeColor || 'gray'}`}>
                                                        {ct?.shortLabel || s.classType || 'Unknown'}
                                                    </span>
                                                    {isTermClass && <span className="badge badge-indigo" style={{ marginLeft: '4px' }}>Term</span>}
                                                    {isTermSession && <span className="badge badge-amber" style={{ marginLeft: '4px' }}>Term Session</span>}
                                                    {' '}{s.className}
                                                </>
                                            );
                                        })()}
                                    </td>
                                    <td>
                                        {isTermSession && s.schedule ? (() => {
                                            const assignedCount = s.schedule.filter(e => e.recipeId && e.status === 'active').length;
                                            const activeCount = s.schedule.filter(e => e.status === 'active').length;
                                            if (assignedCount === 0) {
                                                return <span className={styles.mutedText}>0 of {activeCount} assigned</span>;
                                            }
                                            const firstAssigned = s.schedule.find(e => e.recipeId && e.status === 'active');
                                            return (
                                                <div className={styles.recipeCell}>
                                                    {firstAssigned?.recipePhotoUrl ? (
                                                        <img src={firstAssigned.recipePhotoUrl} alt={firstAssigned.recipeName} className={styles.recipeThumb} />
                                                    ) : (
                                                        <span className={styles.recipePlaceholder}><ChefHat size={14} /></span>
                                                    )}
                                                    <div className={styles.recipeInfo}>
                                                        <span className={styles.recipeName}>{assignedCount} of {activeCount} assigned</span>
                                                        <span className={styles.skillsText}>{firstAssigned?.recipeName}{assignedCount > 1 ? ` +${assignedCount - 1} more` : ''}</span>
                                                    </div>
                                                </div>
                                            );
                                        })() : s.recipeName ? (
                                            <div className={styles.recipeCell}>
                                                {s.recipePhotoUrl ? (
                                                    <img
                                                        src={s.recipePhotoUrl}
                                                        alt={`Photo of ${s.recipeName}`}
                                                        className={styles.recipeThumb}
                                                    />
                                                ) : (
                                                    <span className={styles.recipePlaceholder}>
                                                        <ChefHat size={14} />
                                                    </span>
                                                )}
                                                <div className={styles.recipeInfo}>
                                                    <span className={styles.recipeName}>{s.recipeName}</span>
                                                    {s.skills && s.skills.length > 0 && (
                                                        <span className={styles.skillsText}>{s.skills.join(', ')}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <span className={styles.mutedText}>—</span>
                                        )}
                                    </td>
                                    <td className={styles.mutedText}>{s.venueName}</td>
                                    <td>
                                        <span className={`badge ${s.spotsAvailable > 5 ? 'badge-green' : s.spotsAvailable > 0 ? 'badge-amber' : 'badge-red'}`}>
                                            {s.spotsAvailable} left
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`badge ${s.status === 'open' ? 'badge-indigo' : 'badge-gray'}`}>{s.status}</span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className="flex justify-end gap-2">
                                            {guestCheckoutEnabled && s.status === 'open' && (
                                                <>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        style={{ position: 'relative' }}
                                                        title={copiedLinkId === `guest-${s.id}` ? 'Copied!' : 'Copy Guest Link'}
                                                        onClick={() => handleCopyGuestLink(s.id)}
                                                        aria-label={`Copy guest booking link for session on ${s.date}`}
                                                    >
                                                        <LinkIcon size={16} strokeWidth={1.5} />
                                                        {copiedLinkId === `guest-${s.id}` && <span className={styles.copiedTooltip}>Copied!</span>}
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        style={{ position: 'relative' }}
                                                        title={copiedLinkId === `whatsapp-${s.id}` ? 'Copied!' : 'Copy WhatsApp Link'}
                                                        onClick={() => handleCopyWhatsAppLink(s)}
                                                        aria-label={`Copy WhatsApp guest booking link for session on ${s.date}`}
                                                    >
                                                        <MessageCircle size={16} strokeWidth={1.5} />
                                                        {copiedLinkId === `whatsapp-${s.id}` && <span className={styles.copiedTooltip}>Copied!</span>}
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                title="Generate Social Link"
                                                onClick={() => handleOpenSocialLinkModal(s)}
                                                aria-label={`Generate social booking link for session on ${s.date}`}
                                            >
                                                <Share2 size={16} strokeWidth={1.5} />
                                            </button>
                                            <button className="btn btn-ghost btn-sm" title="View Register" onClick={() => handleOpenRegister(s)}><ClipboardList size={16} strokeWidth={1.5} /></button>
                                            <button className="btn btn-ghost btn-sm" title="Edit Session" onClick={() => handleOpenModal(s)}><Edit2 size={16} strokeWidth={1.5} /></button>
                                            <button className="btn btn-ghost btn-sm text-danger" title="Delete Session" onClick={() => handleDelete(s)}><Trash2 size={16} strokeWidth={1.5} /></button>
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div
                        className="modal"
                        style={{ transform: `translate(${modalPos.x}px, ${modalPos.y}px)`, transition: isDragging ? 'none' : undefined }}
                    >
                        <div
                            className="modal-header"
                            style={{ cursor: 'grab', userSelect: 'none' }}
                            onMouseDown={handleDragStart}
                        >
                            <h2 className="modal-title">{editingSession ? 'Edit Session' : 'Add Session'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className={styles.form}>
                            {/* Session Type Toggle */}
                            {!editingSession && (
                                <div className="form-group">
                                    <label className="form-label">Session Type</label>
                                    <div className={styles.sessionTypeToggle}>
                                        <button
                                            type="button"
                                            className={`${styles.toggleBtn} ${sessionTypeToggle === 'single' ? styles.toggleBtnActive : ''}`}
                                            onClick={() => setSessionTypeToggle('single')}
                                        >
                                            Single
                                        </button>
                                        <button
                                            type="button"
                                            className={`${styles.toggleBtn} ${sessionTypeToggle === 'term' ? styles.toggleBtnActive : ''}`}
                                            onClick={() => setSessionTypeToggle('term')}
                                        >
                                            Term
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Class</label>
                                <select className="form-select" value={formData.classId} onChange={e => {
                                    const selectedClass = classes.find(c => c.id === e.target.value);
                                    setFormData({ ...formData, classId: e.target.value });
                                    if (selectedClass && sessionTypeToggle === 'term') {
                                        setTermFormData(prev => ({
                                            ...prev,
                                            ageMin: selectedClass.ageMin || prev.ageMin,
                                            ageMax: selectedClass.ageMax || prev.ageMax,
                                            spotsTotal: selectedClass.maxSize || prev.spotsTotal,
                                            price: selectedClass.price || prev.price,
                                        }));
                                    }
                                }} required>
                                    <option value="">Select Class...</option>
                                    {classes.map(c => <option key={c.id} value={c.id}>{c.name || c.type} — {c.venueName}</option>)}
                                </select>
                            </div>

                            {sessionTypeToggle === 'single' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Session Title (Optional)</label>
                                        <input
                                            className="form-input"
                                            value={formData.title}
                                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="e.g. Day 1: Introduction (leave blank to use recipe name)"
                                        />
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Session Date</label>
                                            <input type="date" className="form-input" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} required />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Availability (Spots)</label>
                                            <input type="number" className="form-input" value={formData.spotsAvailable} onChange={e => setFormData({ ...formData, spotsAvailable: parseInt(e.target.value) })} required />
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Recipes (Optional)</label>
                                            <select
                                                className="form-select"
                                                value={recipeDropdownValue}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    if (val && !formData.recipeIds.includes(val)) {
                                                        setFormData({ ...formData, recipeIds: [...formData.recipeIds, val] });
                                                    }
                                                    setRecipeDropdownValue('');
                                                }}
                                            >
                                                <option value="">Add a recipe...</option>
                                                {recipes.filter(r => !formData.recipeIds.includes(r.id)).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                            </select>
                                            {formData.recipeIds.length > 0 && (
                                                <div className={styles.skillsTagContainer} style={{ marginTop: '8px' }}>
                                                    {formData.recipeIds.map(rid => {
                                                        const r = recipes.find(rec => rec.id === rid);
                                                        return (
                                                            <span key={rid} className={styles.skillTag}>
                                                                {r?.name || rid}
                                                                <button
                                                                    type="button"
                                                                    className={styles.skillTagRemove}
                                                                    onClick={() => setFormData({ ...formData, recipeIds: formData.recipeIds.filter(id => id !== rid) })}
                                                                    aria-label={`Remove recipe: ${r?.name || rid}`}
                                                                >
                                                                    &times;
                                                                </button>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Instructor (Optional)</label>
                                            <select className="form-select" value={formData.instructorId} onChange={e => setFormData({ ...formData, instructorId: e.target.value })}>
                                                <option value="">None</option>
                                                {instructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select className="form-select" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as any })}>
                                            <option value="open">Open</option>
                                            <option value="closed">Closed</option>
                                            <option value="cancelled">Cancelled</option>
                                        </select>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Start Time (optional — defaults to class time)</label>
                                            <input
                                                type="time"
                                                className="form-input"
                                                value={formData.startTime}
                                                onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                                placeholder={classes.find(c => c.id === formData.classId)?.startTime || ''}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">End Time (optional — defaults to class time)</label>
                                            <input
                                                type="time"
                                                className="form-input"
                                                value={formData.endTime}
                                                onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                                                placeholder={classes.find(c => c.id === formData.classId)?.endTime || ''}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            {sessionTypeToggle === 'term' && (
                                <>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Term Start Date</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={termFormData.termStartDate}
                                                onChange={e => setTermFormData({ ...termFormData, termStartDate: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Term End Date</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={termFormData.termEndDate}
                                                onChange={e => setTermFormData({ ...termFormData, termEndDate: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Days of Week</label>
                                            <div className={styles.daysCheckboxGroup}>
                                                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                                                    <label key={day} className={styles.dayCheckbox}>
                                                        <input
                                                            type="checkbox"
                                                            checked={termFormData.daysOfWeek.includes(day)}
                                                            onChange={e => {
                                                                if (e.target.checked) {
                                                                    setTermFormData({ ...termFormData, daysOfWeek: [...termFormData.daysOfWeek, day] });
                                                                } else {
                                                                    setTermFormData({ ...termFormData, daysOfWeek: termFormData.daysOfWeek.filter(d => d !== day) });
                                                                }
                                                            }}
                                                        />
                                                        {day.slice(0, 3)}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Spots Total</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={termFormData.spotsTotal}
                                                onChange={e => setTermFormData({ ...termFormData, spotsTotal: parseInt(e.target.value) || 0 })}
                                                min={1}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Price (pence)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={termFormData.price}
                                                onChange={e => setTermFormData({ ...termFormData, price: parseInt(e.target.value) || 0 })}
                                                min={1}
                                                required
                                            />
                                            <span className={styles.priceHint}>£{(termFormData.price / 100).toFixed(2)}</span>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Instructor</label>
                                            <select className="form-select" value={formData.instructorId} onChange={e => setFormData({ ...formData, instructorId: e.target.value })} required>
                                                <option value="">Select Instructor...</option>
                                                {instructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Start Time</label>
                                            <input
                                                type="time"
                                                className="form-input"
                                                value={formData.startTime}
                                                onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">End Time</label>
                                            <input
                                                type="time"
                                                className="form-input"
                                                value={formData.endTime}
                                                onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Min Age</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={termFormData.ageMin}
                                                onChange={e => setTermFormData({ ...termFormData, ageMin: parseInt(e.target.value) || 0 })}
                                                min={0}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Max Age</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={termFormData.ageMax}
                                                onChange={e => setTermFormData({ ...termFormData, ageMax: parseInt(e.target.value) || 0 })}
                                                min={1}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select
                                            className="form-select"
                                            value={termFormData.status}
                                            onChange={e => setTermFormData({ ...termFormData, status: e.target.value as Session['status'] })}
                                        >
                                            <option value="draft">Draft</option>
                                            <option value="open">Open</option>
                                            <option value="closed">Closed</option>
                                            <option value="cancelled">Cancelled</option>
                                            <option value="full">Full</option>
                                        </select>
                                    </div>

                                    {termFormError && (
                                        <p className={styles.termFormError}>{termFormError}</p>
                                    )}

                                    {/* Schedule Editor — only shown when editing an existing term session */}
                                    {editingSession && editingSession.sessionType === 'term' && editingSession.schedule && (
                                        <TermScheduleEditor
                                            sessionId={editingSession.id}
                                            schedule={editingSession.schedule}
                                            onScheduleChange={(updatedSchedule) => {
                                                // Update both the sessions list and the editing session reference
                                                setSessions(prev => prev.map(s =>
                                                    s.id === editingSession.id
                                                        ? { ...s, schedule: updatedSchedule }
                                                        : s
                                                ));
                                                setEditingSession(prev => prev ? { ...prev, schedule: updatedSchedule } : prev);
                                            }}
                                        />
                                    )}
                                </>
                            )}

                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {sessionTypeToggle === 'term' ? (editingSession ? 'Save Term Session' : 'Create Term Session') : 'Save Session'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Session Register Modal */}
            {registerSession && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '95vw', width: '1200px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                Session Register — {registerSession.className}{' '}
                                ({registerSession.date ? new Date(registerSession.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'})
                            </h2>
                            <button className="modal-close" onClick={handleCloseRegister}><X size={20} /></button>
                        </div>

                        <div className={styles.registerMeta}>
                            <span><MapPin size={14} /> {registerSession.venueName}</span>
                            <span><Clock size={14} /> {registerSession.startTime} – {registerSession.endTime}</span>
                            <span><UserCheck size={14} /> {registerBookings.filter(b => b.status === 'confirmed').length} participant{registerBookings.filter(b => b.status === 'confirmed').length !== 1 ? 's' : ''}</span>
                        </div>

                        {registerLoading ? (
                            <div className="spinner" />
                        ) : registerBookings.length === 0 ? (
                            <div className={styles.registerEmpty}>No bookings for this session yet.</div>
                        ) : (
                            <div className={styles.registerTableWrapper}>
                                <table className={styles.registerTable}>
                                    <thead>
                                        <tr>
                                            <th>Participant</th>
                                            <th>Age</th>
                                            <th>Mode</th>
                                            <th>Source</th>
                                            <th>Status</th>
                                            <th>Medical</th>
                                            <th>Emergency</th>
                                            <th>Authorised Collector</th>
                                            <th>Sign In</th>
                                            <th>Sign Out</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {registerBookings.map(booking => {
                                            const participantName = getParticipantName(booking);
                                            const parentName = getParentName(booking);
                                            const age = getParticipantAge(booking, registerSession.date);
                                            const medicalFlag = hasMedicalFlag(booking);
                                            const emergencyFlag = hasEmergencyContact(booking);
                                            const collectorName = getAuthorisedCollectorName(booking);
                                            const mode = booking.bookingMode || 'account';
                                            const source = booking.bookingSource;
                                            const isExpanded = expandedDetailId === booking.id;
                                            const medicalDetails = getMedicalDetailsSummary(booking);
                                            const emergencyDetails = getEmergencyContactDetails(booking);

                                            return (
                                                <Fragment key={booking.id}>
                                                <tr>
                                                    <td>
                                                        <div className={styles.registerNameCell}>
                                                            <strong>{participantName}</strong>
                                                            <span>Parent: {parentName}</span>
                                                        </div>
                                                    </td>
                                                    <td>{age !== null ? age : '—'}</td>
                                                    <td>
                                                        <span className={`badge ${mode === 'guest' ? 'badge-amber' : 'badge-indigo'}`}>
                                                            {mode === 'guest' ? 'Guest' : 'Account'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {source ? (
                                                            <span className={`badge ${getSourceBadgeClass(source)}`}>
                                                                {getSourceLabel(source)}
                                                            </span>
                                                        ) : (
                                                            <span className={styles.mutedText}>—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${booking.status === 'confirmed' ? 'badge-green' : 'badge-red'}`}>
                                                            {booking.status}
                                                        </span>
                                                    </td>
                                                    <td className={styles.flagCell}>
                                                        {medicalFlag ? (
                                                            <button
                                                                type="button"
                                                                className={styles.registerDetailToggle}
                                                                title="View medical details"
                                                                aria-expanded={isExpanded}
                                                                aria-label={`View medical details for ${participantName}`}
                                                                onClick={() => setExpandedDetailId(isExpanded ? null : booking.id)}
                                                            >
                                                                🏥
                                                            </button>
                                                        ) : (
                                                            <span className={styles.mutedText}>—</span>
                                                        )}
                                                    </td>
                                                    <td className={styles.flagCell}>
                                                        {emergencyFlag ? (
                                                            <button
                                                                type="button"
                                                                className={styles.registerDetailToggle}
                                                                title="View emergency contact"
                                                                aria-expanded={isExpanded}
                                                                aria-label={`View emergency contact for ${participantName}`}
                                                                onClick={() => setExpandedDetailId(isExpanded ? null : booking.id)}
                                                            >
                                                                📞
                                                            </button>
                                                        ) : (
                                                            <span className={styles.mutedText}>—</span>
                                                        )}
                                                    </td>
                                                    <td className={styles.mutedText}>{collectorName}</td>
                                                    <td>
                                                        <input
                                                            type="time"
                                                            className={styles.registerTimeInput}
                                                            value={signInTimes[booking.id] || ''}
                                                            onChange={e => setSignInTimes(prev => ({ ...prev, [booking.id]: e.target.value }))}
                                                            aria-label={`Sign in time for ${participantName}`}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="time"
                                                            className={styles.registerTimeInput}
                                                            value={signOutTimes[booking.id] || ''}
                                                            onChange={e => setSignOutTimes(prev => ({ ...prev, [booking.id]: e.target.value }))}
                                                            aria-label={`Sign out time for ${participantName}`}
                                                        />
                                                    </td>
                                                </tr>
                                                {isExpanded && (medicalDetails.length > 0 || emergencyDetails) && (
                                                    <tr className={styles.registerDetailRow}>
                                                        <td colSpan={10}>
                                                            <div className={styles.registerDetailContent}>
                                                                {medicalDetails.length > 0 && (
                                                                    <div className={styles.registerDetailSection}>
                                                                        <strong>Medical / Dietary</strong>
                                                                        <ul className={styles.registerDetailList}>
                                                                            {medicalDetails.map((detail, i) => (
                                                                                <li key={i}>{detail}</li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                                {emergencyDetails && (
                                                                    <div className={styles.registerDetailSection}>
                                                                        <strong>Emergency Contact</strong>
                                                                        <p>{emergencyDetails.name} ({emergencyDetails.relationship}) — {emergencyDetails.phone}{emergencyDetails.email ? ` — ${emergencyDetails.email}` : ''}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Social Booking Link Generator Modal */}
            {socialLinkSession && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '480px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Generate Social Link</h2>
                            <button className="modal-close" onClick={handleCloseSocialLinkModal}><X size={20} /></button>
                        </div>

                        <div className={styles.socialLinkBody}>
                            {/* Warning if session is not open or no spots available */}
                            {(socialLinkSession.status !== 'open' || socialLinkSession.spotsAvailable === 0) && (
                                <div className={styles.socialLinkWarning}>
                                    <AlertTriangle size={16} />
                                    <span>
                                        {socialLinkSession.status !== 'open'
                                            ? `This session is currently "${socialLinkSession.status}".`
                                            : 'No spots available for this session.'}
                                        {' '}Link can still be generated.
                                    </span>
                                </div>
                            )}

                            <div className={styles.socialLinkSessionInfo}>
                                <strong>{socialLinkSession.className}</strong>
                                <span>
                                    {socialLinkSession.date
                                        ? new Date(socialLinkSession.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                                        : 'N/A'}
                                    {' · '}{socialLinkSession.venueName}
                                    {' · '}{socialLinkSession.spotsAvailable} spot{socialLinkSession.spotsAvailable !== 1 ? 's' : ''} left
                                </span>
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="social-campaign-name">
                                    Campaign Name <span className={styles.socialLinkOptional}>(optional)</span>
                                </label>
                                <input
                                    id="social-campaign-name"
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g. summer_2025, instagram_promo"
                                    value={socialCampaignName}
                                    onChange={e => handleCampaignNameChange(e.target.value)}
                                    maxLength={50}
                                    aria-describedby={socialCampaignError ? 'social-campaign-error' : undefined}
                                    aria-invalid={!!socialCampaignError}
                                />
                                {socialCampaignError && (
                                    <p id="social-campaign-error" className={styles.socialLinkError}>
                                        {socialCampaignError}
                                    </p>
                                )}
                                <p className={styles.socialLinkHint}>
                                    Letters, numbers, hyphens, and underscores only. Max 50 characters.
                                </p>
                            </div>

                            <button
                                className="btn btn-primary"
                                onClick={handleGenerateSocialLink}
                                disabled={!!socialCampaignError}
                                style={{ width: '100%' }}
                            >
                                {socialLinkCopied ? '✓ Copied to Clipboard!' : 'Generate & Copy Link'}
                            </button>

                            {generatedSocialLink && (
                                <div className={styles.socialLinkResult}>
                                    <code className={styles.socialLinkUrl}>{generatedSocialLink}</code>
                                    {socialLinkCopied && (
                                        <span className={styles.socialLinkCopiedBadge}>Copied!</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
