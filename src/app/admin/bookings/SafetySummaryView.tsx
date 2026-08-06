'use client';

/**
 * SafetySummaryView — Restricted safety summary for guest bookings.
 *
 * Displays the full medical/safety data from a guest booking's embedded snapshots.
 * Access is restricted to admin and instructor roles only.
 *
 * Renders as a modal/panel that can be triggered from the admin bookings list
 * or session register views.
 *
 * Requirements: GUEST-FR-012 (12.5, 12.6)
 */

import { X, ShieldAlert, Phone, UserCheck, AlertTriangle, Heart, Pill, Eye, Ear, Wind } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Booking, SafetyReviewStatus } from '@/types';
import styles from './SafetySummaryView.module.css';

interface SafetySummaryViewProps {
    booking: Booking;
    onClose: () => void;
}

/** Roles permitted to view the safety summary. */
const ALLOWED_ROLES = ['admin', 'instructor'] as const;

export default function SafetySummaryView({ booking, onClose }: SafetySummaryViewProps) {
    const { btUser } = useAuth();

    // Role-based access restriction
    const userRole = btUser?.role;
    const hasAccess = userRole && (ALLOWED_ROLES as readonly string[]).includes(userRole);

    if (!hasAccess) {
        return (
            <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Access denied">
                <div className={styles.panel} onClick={e => e.stopPropagation()}>
                    <div className={styles.accessDenied}>
                        <ShieldAlert size={40} />
                        <h3>Access Restricted</h3>
                        <p>Safety summary information is only available to admin and instructor roles.</p>
                        <button className="btn btn-ghost" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        );
    }

    const medical = booking.medicalSnapshot;
    const allergyDietary = booking.allergyDietarySnapshot;
    const emergencyContact = booking.emergencyContactSnapshot;
    const authorisedCollector = booking.authorisedCollectorSnapshot;
    const childSnapshot = booking.childSnapshot;
    const safetyStatus = booking.safetyReviewStatus || 'not_required';
    const safetyNotes = booking.safetyReviewNotes || '';

    // Derive student name
    const studentName = childSnapshot
        ? `${childSnapshot.firstName} ${childSnapshot.lastName}`
        : booking.studentName || 'Unknown';

    return (
        <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Safety summary">
            <div className={styles.panel} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div>
                        <h2>Safety Summary</h2>
                        <p>{studentName}</p>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close safety summary">
                        <X size={20} />
                    </button>
                </div>

                {/* Safety Review Status */}
                <div className={styles.section}>
                    <h3><ShieldAlert size={14} /> Safety Review Status</h3>
                    <SafetyStatusBadge status={safetyStatus} />
                </div>

                {/* Medical Flags (quick visual indicators) */}
                {medical && (
                    <div className={styles.section}>
                        <h3><Heart size={14} /> Medical Flags</h3>
                        <div className={styles.flagRow}>
                            {medical.foodAllergies && (
                                <span className={`${styles.flag} ${styles.flagDanger}`}>
                                    <AlertTriangle size={12} /> Food Allergies
                                </span>
                            )}
                            {medical.airborneAllergies && (
                                <span className={`${styles.flag} ${styles.flagDanger}`}>
                                    <Wind size={12} /> Airborne Allergies
                                </span>
                            )}
                            {medical.epipenRequired && (
                                <span className={`${styles.flag} ${styles.flagDanger}`}>
                                    <Pill size={12} /> EpiPen Required
                                </span>
                            )}
                            {medical.respiratoryProblems && (
                                <span className={`${styles.flag} ${styles.flagWarning}`}>
                                    Respiratory Problems
                                </span>
                            )}
                            {medical.visionImpairment && (
                                <span className={`${styles.flag} ${styles.flagInfo}`}>
                                    <Eye size={12} /> Vision Impairment
                                </span>
                            )}
                            {medical.hearingImpairment && (
                                <span className={`${styles.flag} ${styles.flagInfo}`}>
                                    <Ear size={12} /> Hearing Impairment
                                </span>
                            )}
                            {!medical.foodAllergies && !medical.airborneAllergies && !medical.epipenRequired &&
                             !medical.respiratoryProblems && !medical.visionImpairment && !medical.hearingImpairment && (
                                <span className={`${styles.flag} ${styles.flagSuccess}`}>No medical flags</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Dietary Requirements & Allergies */}
                <div className={styles.section}>
                    <h3><AlertTriangle size={14} /> Dietary Requirements & Allergies</h3>
                    <div className={styles.fieldGrid}>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Dietary Requirements</span>
                            <span className={medical?.dietaryRequirements ? styles.fieldValue : styles.fieldValueMuted}>
                                {medical?.dietaryRequirements || allergyDietary?.dietaryRequirements?.join(', ') || 'None declared'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Food Allergies</span>
                            <span className={medical?.foodAllergies ? styles.fieldValue : styles.fieldValueMuted}>
                                {allergyDietary?.foodAllergies?.length
                                    ? allergyDietary.foodAllergies.join(', ')
                                    : medical?.foodAllergies ? 'Yes (see details)' : 'None declared'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Airborne Allergies</span>
                            <span className={medical?.airborneAllergies ? styles.fieldValue : styles.fieldValueMuted}>
                                {allergyDietary?.airborneAllergies?.length
                                    ? allergyDietary.airborneAllergies.join(', ')
                                    : medical?.airborneAllergies ? 'Yes (see details)' : 'None declared'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Allergen Details</span>
                            <span className={medical?.allergenDetails ? styles.fieldValue : styles.fieldValueMuted}>
                                {medical?.allergenDetails || allergyDietary?.allergenDetails || 'None'}
                            </span>
                        </div>
                        <div className={styles.fieldFull}>
                            <span className={styles.fieldLabel}>Known Reactions</span>
                            <span className={medical?.knownReactions ? styles.fieldValue : styles.fieldValueMuted}>
                                {medical?.knownReactions || allergyDietary?.reactionDetails || 'None declared'}
                            </span>
                        </div>
                        <div className={styles.fieldFull}>
                            <span className={styles.fieldLabel}>Symptoms</span>
                            <span className={medical?.symptoms ? styles.fieldValue : styles.fieldValueMuted}>
                                {medical?.symptoms || allergyDietary?.symptoms || 'None declared'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Medication & EpiPen */}
                <div className={styles.section}>
                    <h3><Pill size={14} /> Medication & EpiPen</h3>
                    <div className={styles.fieldGrid}>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>EpiPen Required</span>
                            <span className={medical?.epipenRequired ? styles.fieldValue : styles.fieldValueMuted}>
                                {medical?.epipenRequired ? 'Yes' : 'No'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>EpiPen Details</span>
                            <span className={medical?.epipenDetails ? styles.fieldValue : styles.fieldValueMuted}>
                                {medical?.epipenDetails || 'N/A'}
                            </span>
                        </div>
                        <div className={styles.fieldFull}>
                            <span className={styles.fieldLabel}>Medication Details</span>
                            <span className={medical?.medicationDetails ? styles.fieldValue : styles.fieldValueMuted}>
                                {medical?.medicationDetails || 'None declared'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Medical Needs */}
                <div className={styles.section}>
                    <h3><Heart size={14} /> Medical Needs</h3>
                    <div className={styles.fieldGrid}>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Respiratory Problems</span>
                            <span className={medical?.respiratoryProblems ? styles.fieldValue : styles.fieldValueMuted}>
                                {medical?.respiratoryProblems ? 'Yes' : 'No'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Medical Conditions</span>
                            <span className={medical?.medicalConditions ? styles.fieldValue : styles.fieldValueMuted}>
                                {medical?.medicalConditions || 'None declared'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Recent Operations</span>
                            <span className={medical?.recentOperations ? styles.fieldValue : styles.fieldValueMuted}>
                                {medical?.recentOperations || 'None'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Additional Support Needs</span>
                            <span className={medical?.additionalSupportNeeds ? styles.fieldValue : styles.fieldValueMuted}>
                                {medical?.additionalSupportNeeds || 'None declared'}
                            </span>
                        </div>
                        <div className={styles.fieldFull}>
                            <span className={styles.fieldLabel}>Other Safety Information</span>
                            <span className={medical?.otherSafetyInfo ? styles.fieldValue : styles.fieldValueMuted}>
                                {medical?.otherSafetyInfo || 'None'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Emergency Contact */}
                <div className={styles.section}>
                    <h3><Phone size={14} /> Emergency Contact</h3>
                    <div className={styles.fieldGrid}>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Name</span>
                            <span className={emergencyContact?.name ? styles.fieldValue : styles.fieldValueMuted}>
                                {emergencyContact?.name || 'Not provided'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Relationship</span>
                            <span className={emergencyContact?.relationship ? styles.fieldValue : styles.fieldValueMuted}>
                                {emergencyContact?.relationship || 'Not provided'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Mobile</span>
                            <span className={emergencyContact?.mobile ? styles.fieldValue : styles.fieldValueMuted}>
                                {emergencyContact?.mobile || 'Not provided'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Alternative Phone</span>
                            <span className={emergencyContact?.alternativePhone ? styles.fieldValue : styles.fieldValueMuted}>
                                {emergencyContact?.alternativePhone || 'N/A'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Email</span>
                            <span className={emergencyContact?.email ? styles.fieldValue : styles.fieldValueMuted}>
                                {emergencyContact?.email || 'Not provided'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Authorised Collector */}
                <div className={styles.section}>
                    <h3><UserCheck size={14} /> Authorised Collector</h3>
                    <div className={styles.fieldGrid}>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Name</span>
                            <span className={authorisedCollector?.name ? styles.fieldValue : styles.fieldValueMuted}>
                                {authorisedCollector?.name || 'Not provided'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Relationship</span>
                            <span className={authorisedCollector?.relationship ? styles.fieldValue : styles.fieldValueMuted}>
                                {authorisedCollector?.relationship || 'Not provided'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Phone</span>
                            <span className={authorisedCollector?.phone ? styles.fieldValue : styles.fieldValueMuted}>
                                {authorisedCollector?.phone || 'Not provided'}
                            </span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Same as Parent</span>
                            <span className={styles.fieldValue}>
                                {authorisedCollector?.sameAsParent ? 'Yes' : 'No'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Operational Notes */}
                <div className={styles.section}>
                    <h3>📝 Operational Notes</h3>
                    {safetyNotes ? (
                        <div className={styles.notesBox}>{safetyNotes}</div>
                    ) : (
                        <p className={styles.fieldValueMuted}>No operational notes recorded.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Renders a styled badge for the safety review status */
function SafetyStatusBadge({ status }: { status: SafetyReviewStatus }) {
    const config: Record<SafetyReviewStatus, { label: string; className: string }> = {
        not_required: { label: 'Not Required', className: styles.statusNotRequired },
        pending: { label: 'Pending Review', className: styles.statusPending },
        reviewed: { label: 'Reviewed', className: styles.statusReviewed },
        contact_parent: { label: 'Contact Parent', className: styles.statusContactParent },
        cannot_accommodate: { label: 'Cannot Accommodate', className: styles.statusCannotAccommodate },
    };

    const { label, className } = config[status] || config.not_required;

    return <span className={`${styles.statusBadge} ${className}`}>{label}</span>;
}
