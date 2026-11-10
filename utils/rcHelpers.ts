/**
 * RC Course Number Helper Utilities
 *
 * The core principle: cadets are permanently identified by their RC course number
 * (e.g., RC 12). Their "current year level" is calculated on the fly using the
 * global `active_rc` setting so no individual records ever need updating.
 *
 * Formula: Current Level = (active_rc - course_number) + 1
 *
 * Example with active_rc = 12:
 *   RC 12 → (12 - 12) + 1 = Year 1
 *   RC 11 → (12 - 11) + 1 = Year 2
 *   RC 10 → (12 - 10) + 1 = Year 3
 */

/**
 * Calculates the current academic year level for a cadet.
 * @param courseNumber - The cadet's permanent RC number (e.g., 12 for RC 12)
 * @param activeRC - The current highest/latest RC from app_settings
 * @returns The current year level (1 = newest, 5 = oldest)
 */
export const calculateCurrentLevel = (courseNumber: number, activeRC: number): number => {
    return (activeRC - courseNumber) + 1;
};

/**
 * Formats a course number as a human-readable RC label.
 * @param courseNumber - The RC number (e.g., 12)
 * @returns Formatted string like "Regular Course 12"
 */
export const formatRC = (courseNumber: number): string => `Regular Course ${courseNumber}`;

/**
 * Returns a label like "Regular Course 12 — Year 1" for display.
 */
export const formatRCWithLevel = (courseNumber: number, activeRC: number): string => {
    const level = calculateCurrentLevel(courseNumber, activeRC);
    return `Regular Course ${courseNumber} — Year ${level}`;
};

/**
 * Base offset for Nigerian Police Academy Regular Course (RC) admission year derivation.
 *
 * Ground truth mappings:
 *   - Admission Year 2024 → RC 11 (2024 - 2013 = 11)
 *   - Admission Year 2023 → RC 10 (2023 - 2013 = 10)
 *   - Admission Year 2022 → RC 9  (2022 - 2013 = 9)
 *
 * Formula: RC Number = Admission Year - ADMISSION_YEAR_BASE_OFFSET
 */
export const ADMISSION_YEAR_BASE_OFFSET = 2013;

/**
 * High-confidence reference map of NPA admission years to verified RC course numbers.
 */
export const KNOWN_ADMISSION_YEAR_TO_RC: Readonly<Record<number, number>> = Object.freeze({
    2014: 1,
    2015: 2,
    2016: 3,
    2017: 4,
    2018: 5,
    2019: 6,
    2020: 7,
    2021: 8,
    2022: 9,
    2023: 10,
    2024: 11,
    2025: 12,
    2026: 13,
    2027: 14,
    2028: 15,
    2029: 16,
    2030: 17,
});

/**
 * Automatically deduces the Regular Course (RC) number from an extracted admission year.
 * Checks known cohorts first, then falls back to the scalable offset formula.
 *
 * @param admissionYear - 4-digit admission year (e.g., 2023)
 * @returns The integer RC number (e.g., 10), or null if the year is invalid or cannot be mapped
 */
export const calculateRCFromAdmissionYear = (admissionYear: number): number | null => {
    if (!admissionYear || isNaN(admissionYear) || !Number.isInteger(admissionYear)) {
        return null;
    }

    if (KNOWN_ADMISSION_YEAR_TO_RC[admissionYear] !== undefined) {
        return KNOWN_ADMISSION_YEAR_TO_RC[admissionYear];
    }

    const derivedRC = admissionYear - ADMISSION_YEAR_BASE_OFFSET;
    // RC numbers must be positive integers within reasonable historical/future bounds (RC 1 to RC 100)
    if (derivedRC >= 1 && derivedRC <= 100) {
        return derivedRC;
    }

    return null;
};

/**
 * Reverses an RC number to deduce the corresponding admission year.
 *
 * @param rcNumber - Regular Course number (e.g., 10 for RC 10)
 * @returns 4-digit admission year (e.g., 2023)
 */
export const calculateAdmissionYearFromRC = (rcNumber: number): number => {
    return rcNumber + ADMISSION_YEAR_BASE_OFFSET;
};
