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
