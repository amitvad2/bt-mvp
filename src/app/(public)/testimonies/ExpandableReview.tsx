'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import styles from './page.module.css';

interface ExpandableReviewProps {
    quote: string;
    authorTitle: string;
    authorOrg: string;
    imageSrc?: string;
}

export default function ExpandableReview({ quote, authorTitle, authorOrg, imageSrc }: ExpandableReviewProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [imgError, setImgError] = useState(false);

    const hasImage = imageSrc && !imgError;

    return (
        <div className={styles.featuredReview}>
            <div className={styles.quoteWrapper}>
                <div className={styles.quoteHeader}>
                    <p className={styles.mainQuote}>"{quote}"</p>
                    {hasImage && (
                        <button
                            className={styles.expandButton}
                            onClick={() => setIsExpanded(!isExpanded)}
                            aria-label={isExpanded ? "Hide original review" : "Show original review"}
                        >
                            {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                        </button>
                    )}
                </div>

                <div className={styles.authorInfo}>
                    <strong>{authorTitle}</strong>
                    <span>{authorOrg}</span>
                </div>
            </div>

            {isExpanded && hasImage && (
                <div className={styles.reviewImageContainer}>
                    <hr className={styles.imageDivider} />
                    <img
                        src={imageSrc}
                        alt={`Original review from ${authorOrg}`}
                        className={styles.reviewImage}
                        onError={() => setImgError(true)}
                    />
                </div>
            )}
        </div>
    );
}
