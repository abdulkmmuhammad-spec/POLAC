import * as XLSX from 'xlsx';
import {
    calculateCurrentLevel,
    calculateRCFromAdmissionYear,
    calculateAdmissionYearFromRC
} from '../utils/rcHelpers.ts';
import type {
    TemplateImportFormat,
    ParsedCadetRow,
    CadetImportParseResult
} from '../types.ts';

/**
 * Result structure for parsing an NPA Number string.
 */
export interface NPAParseResult {
    isValid: boolean;
    raw: string;
    normalizedNPA?: string;
    prefix?: string;         // Segment 1 (e.g., NPA)
    positionalIndex?: string; // Segment 2 (e.g., 03)
    squad?: string;          // Segment 3 (e.g., 04) - mapped directly
    admissionYear?: number;  // Segment 4 (e.g., 2023)
    rcNumber?: number;       // Deduced from Segment 4 (e.g., 10 for RC 10)
    serialNumber?: string;   // Segment 5 (e.g., 0395)
    errorMessage?: string;
}

/**
 * Regex to validate and parse structured NPA Number strings.
 * Format: [PREFIX]/[INDEX]/[SQUAD]/[ADMISSION_YEAR]/[SERIAL]
 * Example: NPA/03/04/2023/0395
 */
export const NPA_NUMBER_REGEX = /^([A-Za-z]+)\s*\/\s*(\d+)\s*\/\s*([A-Za-z0-9_-]+)\s*\/\s*(\d{4})\s*\/\s*([A-Za-z0-9_-]+)$/i;

/**
 * Parses a structured NPA Number string and extracts all positional segments,
 * validating format integrity and automatically deriving the RC course number.
 *
 * Segment breakdown:
 *   - Segment 1: Prefix ('NPA') -> Format check
 *   - Segment 2: Positional index ('03') -> Positional tracking
 *   - Segment 3: Squad Identifier ('04') -> Direct mapping to squad
 *   - Segment 4: Admission Year ('2023') -> Deduces RC number (2023 -> RC 10)
 *   - Segment 5: Unique Serial ('0395') -> Cadet tracking & conflict resolution
 *
 * @param rawNpa - Raw string input from CSV/Excel (e.g., 'NPA/03/04/2023/0395')
 * @returns NPAParseResult with validation status and extracted/derived fields
 */
export function parseNPANumber(rawNpa: string | null | undefined): NPAParseResult {
    if (!rawNpa || typeof rawNpa !== 'string' || !rawNpa.trim()) {
        return {
            isValid: false,
            raw: rawNpa ? String(rawNpa) : '',
            errorMessage: 'NPA Number is empty or missing.'
        };
    }

    const trimmed = rawNpa.trim();
    const segments = trimmed.split('/').map(seg => seg.trim());

    if (segments.length !== 5) {
        return {
            isValid: false,
            raw: trimmed,
            errorMessage: `Invalid NPA Number structure: Expected exactly 5 slash-separated segments (e.g. NPA/03/04/2023/0395), but found ${segments.length}.`
        };
    }

    const [segPrefix, segIndex, segSquad, segYear, segSerial] = segments;

    // Segment 1: Prefix
    if (!segPrefix || !/^[A-Za-z]+$/i.test(segPrefix)) {
        return {
            isValid: false,
            raw: trimmed,
            errorMessage: `Invalid Segment 1 prefix '${segPrefix}': Expected alphabetic prefix (e.g., NPA).`
        };
    }

    // Segment 2: Positional index
    if (!segIndex || !/^\d+$/.test(segIndex)) {
        return {
            isValid: false,
            raw: trimmed,
            errorMessage: `Invalid Segment 2 index '${segIndex}': Expected numeric index digits (e.g., 03).`
        };
    }

    // Segment 3: Squad Identifier
    if (!segSquad || segSquad.length === 0) {
        return {
            isValid: false,
            raw: trimmed,
            errorMessage: 'Segment 3 (Squad Identifier) is missing or blank.'
        };
    }

    // Segment 4: Admission Year (must be a 4-digit number)
    if (!segYear || !/^\d{4}$/.test(segYear)) {
        return {
            isValid: false,
            raw: trimmed,
            errorMessage: `Invalid Segment 4 admission year '${segYear}': Expected a 4-digit year (e.g., 2023).`
        };
    }

    // Segment 5: Unique serial / identifier
    if (!segSerial || segSerial.length === 0) {
        return {
            isValid: false,
            raw: trimmed,
            errorMessage: 'Segment 5 (Serial identifier) is missing or blank.'
        };
    }

    const admissionYear = parseInt(segYear, 10);
    const rcNumber = calculateRCFromAdmissionYear(admissionYear);

    if (rcNumber === null) {
        return {
            isValid: false,
            raw: trimmed,
            admissionYear,
            errorMessage: `Admission year ${admissionYear} cannot be mapped to a valid Regular Course (RC) number. Verified cohorts range from 2014 (RC 1) upwards.`
        };
    }

    const normalizedNPA = `${segPrefix.toUpperCase()}/${segIndex}/${segSquad.toUpperCase()}/${segYear}/${segSerial.toUpperCase()}`;

    return {
        isValid: true,
        raw: trimmed,
        normalizedNPA,
        prefix: segPrefix.toUpperCase(),
        positionalIndex: segIndex,
        squad: segSquad.toUpperCase(),
        admissionYear,
        rcNumber,
        serialNumber: segSerial.toUpperCase()
    };
}

/**
 * Finds a value from a row object using multiple potential header names (case-insensitive & stripped).
 */
export function findRowValue(row: Record<string, any>, candidateKeys: string[]): any {
    if (!row || typeof row !== 'object') return undefined;

    // 1. Direct key lookup
    for (const key of candidateKeys) {
        if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
            return row[key];
        }
    }

    // 2. Case-insensitive and normalized stripped lookup
    const normalizedRowKeys = new Map<string, string>();
    for (const key of Object.keys(row)) {
        normalizedRowKeys.set(key.toLowerCase().replace(/[\s_\-.]/g, ''), key);
    }

    for (const key of candidateKeys) {
        const normalizedCandidate = key.toLowerCase().replace(/[\s_\-.]/g, '');
        const matchedActualKey = normalizedRowKeys.get(normalizedCandidate);
        if (matchedActualKey && row[matchedActualKey] !== undefined && row[matchedActualKey] !== null) {
            const val = String(row[matchedActualKey]).trim();
            if (val !== '') return row[matchedActualKey];
        }
    }

    return undefined;
}

/**
 * Automatically inspects the first row/headers of an imported sheet to detect
 * whether it matches the New NPA Template (2-column) or Legacy Template (3-column).
 *
 * @param sampleRow - An object representing the first record from sheet_to_json
 * @returns 'NPA_FORMAT' | 'LEGACY_FORMAT' | 'UNKNOWN'
 */
export function detectTemplateFormat(sampleRow: Record<string, any>): TemplateImportFormat {
    if (!sampleRow || typeof sampleRow !== 'object') return 'UNKNOWN';

    const npaVal = findRowValue(sampleRow, [
        'NPA Number', 'NPA_Number', 'npa_number', 'NPA No', 'NPA No.', 'NPA', 'NPANumber', 'npanumber'
    ]);

    const squadVal = findRowValue(sampleRow, [
        'Squad', 'squad', 'unit', 'Unit', 'Company', 'Platoon', 'squad_name'
    ]);

    const rcVal = findRowValue(sampleRow, [
        'RC_Number', 'RC', 'Course', 'course_number', 'Course Number', 'rc_number', 'rc', 'Year', 'year', 'Year_Group'
    ]);

    // Check for NPA format indicators
    if (npaVal !== undefined) {
        return 'NPA_FORMAT';
    }

    // Check for Legacy format indicators
    if (squadVal !== undefined || rcVal !== undefined) {
        return 'LEGACY_FORMAT';
    }

    // Secondary scan across all row keys
    const rawKeys = Object.keys(sampleRow).map(k => k.toLowerCase().replace(/[\s_\-.]/g, ''));
    if (rawKeys.some(k => k.includes('npa'))) {
        return 'NPA_FORMAT';
    }
    if (rawKeys.some(k => k.includes('squad')) || rawKeys.some(k => k.includes('rc'))) {
        return 'LEGACY_FORMAT';
    }

    return 'UNKNOWN';
}

/**
 * Ingestion options for parsing cadet import files.
 */
export interface CadetImportOptions {
    formatMode?: 'AUTO' | 'NPA_FORMAT' | 'LEGACY_FORMAT';
    activeRC: number;
}

/**
 * Core parsing function that validates and transforms raw tabular data into validated cadet records.
 * Concurrent support for both New NPA format and Legacy format.
 */
export function parseCadetImportData(
    rows: any[],
    options: CadetImportOptions
): CadetImportParseResult {
    const { formatMode = 'AUTO', activeRC } = options;

    if (!rows || rows.length === 0) {
        return {
            detectedFormat: 'UNKNOWN',
            totalRows: 0,
            validRows: [],
            invalidRows: [],
            allRows: [],
            globalErrors: ['The uploaded file contains no data rows.']
        };
    }

    // Detect format
    let effectiveFormat: TemplateImportFormat = 'UNKNOWN';
    if (formatMode === 'AUTO') {
        effectiveFormat = detectTemplateFormat(rows[0]);
    } else {
        effectiveFormat = formatMode;
    }

    const allRows: ParsedCadetRow[] = [];
    const validRows: ParsedCadetRow[] = [];
    const invalidRows: ParsedCadetRow[] = [];

    // Track seen identifiers to flag intra-file duplicate entries
    const seenNpaNumbers = new Map<string, number>();
    const seenLegacyKeys = new Map<string, number>();

    rows.forEach((row, index) => {
        const rowNumber = index + 2; // Row 1 is header, so data starts at row 2

        // Skip completely empty rows
        if (!row || Object.keys(row).length === 0) return;
        const hasValues = Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '');
        if (!hasValues) return;

        const rowErrors: string[] = [];
        let parsedCadet: Partial<ParsedCadetRow> = {
            rowNumber,
            rawData: row
        };

        if (effectiveFormat === 'NPA_FORMAT') {
            // ==========================================
            // NEW NPA TEMPLATE (2 Columns: NPA Number, Name)
            // ==========================================
            const nameRaw = findRowValue(row, [
                'Name', 'Full Name', 'Full_Name', 'name', 'full_name', 'Cadet Name', 'Cadet_Name', 'fullname'
            ]);
            const npaRaw = findRowValue(row, [
                'NPA Number', 'NPA_Number', 'npa_number', 'NPA No', 'NPA No.', 'NPA', 'NPANumber', 'npanumber'
            ]);

            if (!nameRaw || String(nameRaw).trim() === '') {
                rowErrors.push('Missing cadet name.');
            }

            if (!npaRaw || String(npaRaw).trim() === '') {
                rowErrors.push('Missing NPA Number.');
            } else {
                const npaResult = parseNPANumber(String(npaRaw));
                if (!npaResult.isValid) {
                    rowErrors.push(npaResult.errorMessage || 'Invalid NPA Number format.');
                } else {
                    const normNpa = npaResult.normalizedNPA!;

                    // Flag intra-file duplicate NPA numbers
                    if (seenNpaNumbers.has(normNpa)) {
                        const prevRow = seenNpaNumbers.get(normNpa)!;
                        rowErrors.push(
                            `Duplicate NPA Number in file: '${normNpa}' was already defined on Row ${prevRow}. Duplicate entries within the same upload are not permitted.`
                        );
                    } else {
                        seenNpaNumbers.set(normNpa, rowNumber);
                    }

                    const courseNumber = npaResult.rcNumber!;
                    parsedCadet = {
                        ...parsedCadet,
                        name: String(nameRaw || '').trim().toUpperCase(),
                        squad: npaResult.squad, // Segment 3 mapped directly
                        course_number: courseNumber,
                        year_group: calculateCurrentLevel(courseNumber, activeRC),
                        npa_number: normNpa,
                        admission_year: npaResult.admissionYear
                    };
                }
            }

            if (!parsedCadet.name && nameRaw) {
                parsedCadet.name = String(nameRaw).trim().toUpperCase();
            }
            if (!parsedCadet.npa_number && npaRaw) {
                parsedCadet.npa_number = String(npaRaw).trim();
            }
        } else {
            // ==========================================
            // LEGACY TEMPLATE (3 Columns: Name, Squad, RC_Number)
            // ==========================================
            const nameRaw = findRowValue(row, [
                'Name', 'Full Name', 'Full_Name', 'name', 'full_name', 'Cadet Name', 'Cadet_Name', 'fullname'
            ]);
            const squadRaw = findRowValue(row, [
                'Squad', 'squad', 'SQUAD', 'unit', 'Unit', 'Company', 'Platoon', 'squad_name'
            ]);
            const rcRaw = findRowValue(row, [
                'RC_Number', 'RC', 'Course', 'course_number', 'Course Number', 'rc_number', 'rc'
            ]);
            const yearRaw = findRowValue(row, [
                'Year', 'year', 'year_group', 'Year_Group', 'YearGroup', 'Year Group'
            ]);

            if (!nameRaw || String(nameRaw).trim() === '') {
                rowErrors.push('Missing cadet name.');
            }
            if (!squadRaw || String(squadRaw).trim() === '') {
                rowErrors.push('Missing squad assignment.');
            }

            let courseNumber: number | null = null;
            if (rcRaw !== undefined && rcRaw !== null && String(rcRaw).trim() !== '') {
                const parsed = parseInt(String(rcRaw).trim(), 10);
                if (!isNaN(parsed) && parsed > 0) courseNumber = parsed;
            }

            // Fallback: If no RC_Number, deduce from Year (course_number = active_rc - year + 1)
            if (courseNumber === null && yearRaw !== undefined && yearRaw !== null) {
                const yearMatch = String(yearRaw).trim().match(/(\d+)/);
                if (yearMatch) {
                    const yearNum = parseInt(yearMatch[1], 10);
                    courseNumber = activeRC - yearNum + 1;
                }
            }

            if (courseNumber === null) {
                rowErrors.push('Missing or invalid Regular Course (RC) number (e.g., 12 for RC 12).');
            } else if (nameRaw && String(nameRaw).trim() !== '') {
                const legKey = `${String(nameRaw).trim().toUpperCase()}|${courseNumber}`;
                if (seenLegacyKeys.has(legKey)) {
                    const prevRow = seenLegacyKeys.get(legKey)!;
                    rowErrors.push(
                        `Duplicate cadet in file: '${String(nameRaw).trim().toUpperCase()}' (RC ${courseNumber}) already appears on Row ${prevRow}.`
                    );
                } else {
                    seenLegacyKeys.set(legKey, rowNumber);
                }
            }

            parsedCadet = {
                ...parsedCadet,
                name: String(nameRaw || '').trim().toUpperCase(),
                squad: String(squadRaw || '').trim().toUpperCase(),
                course_number: courseNumber || 0,
                year_group: courseNumber ? calculateCurrentLevel(courseNumber, activeRC) : undefined,
                admission_year: courseNumber ? calculateAdmissionYearFromRC(courseNumber) : undefined
            };
        }

        const isValid = rowErrors.length === 0;
        const finalRow: ParsedCadetRow = {
            rowNumber,
            isValid,
            errors: rowErrors,
            name: parsedCadet.name || 'UNKNOWN CADET',
            squad: parsedCadet.squad || 'UNASSIGNED',
            course_number: parsedCadet.course_number || 0,
            year_group: parsedCadet.year_group,
            npa_number: parsedCadet.npa_number,
            admission_year: parsedCadet.admission_year,
            rawData: row
        };

        allRows.push(finalRow);
        if (isValid) {
            validRows.push(finalRow);
        } else {
            invalidRows.push(finalRow);
        }
    });

    return {
        detectedFormat: effectiveFormat,
        totalRows: allRows.length,
        validRows,
        invalidRows,
        allRows,
        globalErrors: []
    };
}

/**
 * Reads a File or ArrayBuffer and executes parsing through XLSX.
 * Supports CSV, XLSX, and XLS formats.
 */
export async function parseCadetImportFile(
    fileInput: File | ArrayBuffer,
    options: CadetImportOptions
): Promise<CadetImportParseResult> {
    try {
        let buffer: ArrayBuffer;
        if (fileInput instanceof File) {
            buffer = await fileInput.arrayBuffer();
        } else {
            buffer = fileInput;
        }

        const workbook = XLSX.read(buffer, { type: 'array' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            return {
                detectedFormat: 'UNKNOWN',
                totalRows: 0,
                validRows: [],
                invalidRows: [],
                allRows: [],
                globalErrors: ['The selected spreadsheet contains no accessible worksheets.']
            };
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

        return parseCadetImportData(jsonRows, options);
    } catch (err: any) {
        console.error('[cadetImportService] File reading error:', err);
        return {
            detectedFormat: 'UNKNOWN',
            totalRows: 0,
            validRows: [],
            invalidRows: [],
            allRows: [],
            globalErrors: [`Failed to parse file: ${err.message || 'Ensure it is a valid .csv, .xlsx, or .xls file.'}`]
        };
    }
}

/**
 * Downloads a text or binary file to the user's browser.
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

/**
 * Generates and triggers the download for the New NPA Format sample CSV template.
 * Headers: NPA Number, Name
 */
export function downloadNPACSVTemplate(): void {
    const csvContent = 
`NPA Number,Name
NPA/03/04/2023/0395,MANI UMAR DAHIRU
NPA/03/08/2024/0112,ABDULSHAKUR MAI GANDI
NPA/03/02/2022/0451,CHUKWUDI EMMANUEL OKONKWO
NPA/03/05/2021/0889,FATIMA BELLO SULEIMAN
`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerFileDownload(blob, 'NPA_Cadet_Enrollment_Template.csv');
}

/**
 * Generates and triggers the download for the New NPA Format sample Excel template.
 */
export function downloadNPAExcelTemplate(): void {
    const sampleData = [
        { 'NPA Number': 'NPA/03/04/2023/0395', Name: 'MANI UMAR DAHIRU' },
        { 'NPA Number': 'NPA/03/08/2024/0112', Name: 'ABDULSHAKUR MAI GANDI' },
        { 'NPA Number': 'NPA/03/02/2022/0451', Name: 'CHUKWUDI EMMANUEL OKONKWO' },
        { 'NPA Number': 'NPA/03/05/2021/0889', Name: 'FATIMA BELLO SULEIMAN' },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'NPA_Enrollment');
    XLSX.writeFile(wb, 'NPA_Cadet_Enrollment_Template.xlsx');
}

/**
 * Generates and triggers the download for the Legacy Format sample Excel template.
 * Headers: Name, Squad, RC_Number
 */
export function downloadLegacyExcelTemplate(): void {
    const sampleData = [
        { Name: 'MANI UMAR DAHIRU', Squad: 'SQUAD 3', RC_Number: 12 },
        { Name: 'ABDULSHAKUR MAI GANDI', Squad: 'SQUAD 8', RC_Number: 11 },
        { Name: 'CHUKWUDI EMMANUEL OKONKWO', Squad: 'SQUAD 2', RC_Number: 10 },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Legacy_Enrollment');
    XLSX.writeFile(wb, 'Cadet_Registry_Legacy_Template.xlsx');
}

/**
 * Builds the exact high-friction confirmation phrase required to unlock bulk course deletion.
 * - Single RC: "DELETE RC-10 RECORDS"
 * - Multiple RCs: "DELETE RC-9, RC-10 RECORDS" (sorted ascending)
 */
export function buildCoursePurgeConfirmationPhrase(courseNumbers: number[]): string {
    if (!courseNumbers || courseNumbers.length === 0) {
        return 'DELETE COURSE RECORDS';
    }
    const sorted = Array.from(new Set(courseNumbers)).sort((a, b) => a - b);
    const rcLabels = sorted.map(rc => `RC-${rc}`).join(', ');
    return `DELETE ${rcLabels} RECORDS`;
}

/**
 * Escapes a CSV cell value safely.
 */
function escapeCSVCell(val: any): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Generates a dual-format compatible CSV backup string from an array of cadet registry records.
 * Includes headers: NPA Number,Name,Squad,RC_Number,Admission_Year,Status,Year_Group
 */
export function generateCourseBackupCSV(cadets: any[]): string {
    const headers = ['NPA Number', 'Name', 'Squad', 'RC_Number', 'Admission_Year', 'Status', 'Year_Group'];
    const lines = [headers.join(',')];

    for (const c of cadets || []) {
        const row = [
            escapeCSVCell(c.npa_number || ''),
            escapeCSVCell(c.name || ''),
            escapeCSVCell(c.squad || ''),
            escapeCSVCell(c.course_number ?? ''),
            escapeCSVCell(c.admission_year ?? ''),
            escapeCSVCell(c.status || 'ACTIVE'),
            escapeCSVCell(c.year_group ?? '')
        ];
        lines.push(row.join(','));
    }

    return lines.join('\n') + '\n';
}

/**
 * Triggers a browser download of the CSV backup for the specified Regular Courses.
 * Returns the generated filename.
 */
export function downloadCourseBackupCSV(cadets: any[], courseNumbers: number[]): string {
    const csvContent = generateCourseBackupCSV(cadets);
    const sorted = Array.from(new Set(courseNumbers)).sort((a, b) => a - b);
    const rcTag = sorted.length > 0 ? sorted.map(rc => `RC${rc}`).join('_') : 'ALL';
    const dateStamp = new Date().toISOString().split('T')[0];
    const filename = `NPA_Course_Backup_${rcTag}_${dateStamp}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerFileDownload(blob, filename);
    return filename;
}
