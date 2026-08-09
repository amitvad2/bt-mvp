/**
 * UTM Parameter Validation and Extraction
 *
 * Validates UTM parameters against the allowed charset [A-Za-z0-9._-]
 * and maximum length of 128 characters per value.
 * Invalid params are silently ignored; valid ones are preserved.
 *
 * Requirements: 7.5, 9.1, 9.2, 9.3
 */

/** Regex pattern for allowed UTM parameter characters */
export const UTM_ALLOWED_CHARS = /^[A-Za-z0-9._-]+$/;

/** Maximum length for any UTM parameter value */
export const UTM_MAX_LENGTH = 128;

export interface ValidatedUtmParams {
  source: string | null;
  medium: string | null;
  campaign: string | null;
}

/**
 * Checks whether a single UTM parameter value is valid.
 * A valid value:
 * - Is defined and non-empty
 * - Contains only characters from [A-Za-z0-9._-]
 * - Is at most 128 characters long
 */
export function isValidUtmValue(value: string | undefined): boolean {
  if (!value) return false;
  if (value.length > UTM_MAX_LENGTH) return false;
  return UTM_ALLOWED_CHARS.test(value);
}

/**
 * Validates and extracts UTM parameters from search params.
 * Invalid params are silently ignored; valid ones are preserved.
 * Returns null if no valid params are present.
 */
export function validateAndExtractUtmParams(
  params: { utm_source?: string; utm_medium?: string; utm_campaign?: string }
): ValidatedUtmParams | null {
  const source = isValidUtmValue(params.utm_source) ? params.utm_source! : null;
  const medium = isValidUtmValue(params.utm_medium) ? params.utm_medium! : null;
  const campaign = isValidUtmValue(params.utm_campaign) ? params.utm_campaign! : null;

  if (!source && !medium && !campaign) {
    return null;
  }

  return { source, medium, campaign };
}
