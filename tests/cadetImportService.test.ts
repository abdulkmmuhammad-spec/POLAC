import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateRCFromAdmissionYear,
    calculateAdmissionYearFromRC,
    ADMISSION_YEAR_BASE_OFFSET
} from '../utils/rcHelpers.ts';
import {
    parseNPANumber,
    detectTemplateFormat,
    parseCadetImportData,
    buildCoursePurgeConfirmationPhrase,
    generateCourseBackupCSV
} from '../services/cadetImportService.ts';
import {
    computeDateRangeForPreset,
    formatActiveFilterBadge,
    doesRecordMatchDateBounds
} from '../utils/dateFilterHelpers.ts';

describe('Cadet Admission Year & Regular Course (RC) Derivation Engine', () => {
    it('should deduce RC number based on admission year with 2013 base offset', () => {
        // Required mappings from specifications
        assert.equal(calculateRCFromAdmissionYear(2024), 11);
        assert.equal(calculateRCFromAdmissionYear(2023), 10);
        assert.equal(calculateRCFromAdmissionYear(2022), 9);

        // Scalable forward and historical formula validation (Admission Year - 2013)
        assert.equal(calculateRCFromAdmissionYear(2021), 8);
        assert.equal(calculateRCFromAdmissionYear(2020), 7);
        assert.equal(calculateRCFromAdmissionYear(2014), 1);
        assert.equal(calculateRCFromAdmissionYear(2025), 12);
        assert.equal(calculateRCFromAdmissionYear(2026), 13);
        assert.equal(calculateRCFromAdmissionYear(2030), 17);
    });

    it('should return null for invalid, out-of-range, or unmappable admission years', () => {
        assert.equal(calculateRCFromAdmissionYear(1800), null);
        assert.equal(calculateRCFromAdmissionYear(2013), null); // RC 0 is invalid
        assert.equal(calculateRCFromAdmissionYear(1990), null);
        assert.equal(calculateRCFromAdmissionYear(2200), null);
        assert.equal(calculateRCFromAdmissionYear(NaN), null);
        assert.equal(calculateRCFromAdmissionYear(null as any), null);
        assert.equal(calculateRCFromAdmissionYear(undefined as any), null);
    });

    it('should calculate admission year from RC number in reverse', () => {
        assert.equal(calculateAdmissionYearFromRC(11), 2024);
        assert.equal(calculateAdmissionYearFromRC(10), 2023);
        assert.equal(calculateAdmissionYearFromRC(9), 2022);
        assert.equal(calculateAdmissionYearFromRC(1), 2014);
    });
});

describe('NPA Number Regex Parser & Validation', () => {
    it('should extract all 5 segments correctly from a valid NPA Number', () => {
        const result = parseNPANumber('NPA/03/04/2023/0395');
        assert.equal(result.isValid, true);
        assert.equal(result.prefix, 'NPA');
        assert.equal(result.positionalIndex, '03');
        assert.equal(result.squad, '04'); // Segment 3 mapped directly
        assert.equal(result.admissionYear, 2023); // Segment 4
        assert.equal(result.rcNumber, 10); // Automatically deduced RC 10
        assert.equal(result.serialNumber, '0395');
        assert.equal(result.normalizedNPA, 'NPA/03/04/2023/0395');
    });

    it('should handle case insensitivity and whitespace around slashes', () => {
        const result = parseNPANumber('  npa / 03 / 08 / 2024 / 0112  ');
        assert.equal(result.isValid, true);
        assert.equal(result.prefix, 'NPA');
        assert.equal(result.positionalIndex, '03');
        assert.equal(result.squad, '08');
        assert.equal(result.admissionYear, 2024);
        assert.equal(result.rcNumber, 11);
        assert.equal(result.serialNumber, '0112');
        assert.equal(result.normalizedNPA, 'NPA/03/08/2024/0112');
    });

    it('should accept alphanumeric squad identifiers (e.g. SQUAD-04 or DELTA)', () => {
        const result = parseNPANumber('NPA/01/DELTA/2022/9981');
        assert.equal(result.isValid, true);
        assert.equal(result.squad, 'DELTA');
        assert.equal(result.admissionYear, 2022);
        assert.equal(result.rcNumber, 9);
    });

    it('should reject malformed NPA Numbers missing segments', () => {
        const resultFourSeg = parseNPANumber('NPA/03/04/2023');
        assert.equal(resultFourSeg.isValid, false);
        assert.match(resultFourSeg.errorMessage!, /Expected exactly 5 slash-separated segments/);

        const resultSixSeg = parseNPANumber('NPA/03/04/2023/0395/EXTRA');
        assert.equal(resultSixSeg.isValid, false);
    });

    it('should reject non-numeric admission years or non-4-digit years', () => {
        const resultTextYear = parseNPANumber('NPA/03/04/ABCD/0395');
        assert.equal(resultTextYear.isValid, false);
        assert.match(resultTextYear.errorMessage!, /Expected a 4-digit year/);

        const resultShortYear = parseNPANumber('NPA/03/04/23/0395');
        assert.equal(resultShortYear.isValid, false);
    });

    it('should reject NPA Numbers where admission year cannot map to a valid RC', () => {
        const resultInvalidYear = parseNPANumber('NPA/03/04/1850/0395');
        assert.equal(resultInvalidYear.isValid, false);
        assert.match(resultInvalidYear.errorMessage!, /cannot be mapped to a valid Regular Course/);
    });

    it('should reject empty or blank strings', () => {
        assert.equal(parseNPANumber('').isValid, false);
        assert.equal(parseNPANumber('   ').isValid, false);
        assert.equal(parseNPANumber(null).isValid, false);
    });
});

describe('Dual-Format Detection Engine', () => {
    it('should detect New NPA Template from headers (2-column: NPA Number, Name)', () => {
        const sample1 = { 'NPA Number': 'NPA/03/04/2023/0395', Name: 'MANI UMAR DAHIRU' };
        assert.equal(detectTemplateFormat(sample1), 'NPA_FORMAT');

        const sample2 = { npa_number: 'NPA/03/04/2023/0395', full_name: 'MANI UMAR' };
        assert.equal(detectTemplateFormat(sample2), 'NPA_FORMAT');

        const sample3 = { 'NPA No': 'NPA/03/04/2023/0395', name: 'TEST CADET' };
        assert.equal(detectTemplateFormat(sample3), 'NPA_FORMAT');
    });

    it('should detect Legacy Template from headers (Name, Squad, RC_Number)', () => {
        const sample1 = { Name: 'MANI UMAR DAHIRU', Squad: 'SQUAD 3', RC_Number: 12 };
        assert.equal(detectTemplateFormat(sample1), 'LEGACY_FORMAT');

        const sample2 = { name: 'ABDULSHAKUR', unit: 'SQUAD 8', Course: 11 };
        assert.equal(detectTemplateFormat(sample2), 'LEGACY_FORMAT');

        const sample3 = { Name: 'CHUKWUDI', squad: 'SQUAD 2', Year: 1 };
        assert.equal(detectTemplateFormat(sample3), 'LEGACY_FORMAT');
    });

    it('should return UNKNOWN for unrecognized schemas', () => {
        const sample = { phone: '12345', address: 'Abuja' };
        assert.equal(detectTemplateFormat(sample), 'UNKNOWN');
    });
});

describe('Concurrent Ingestion Pipeline & Row Validation', () => {
    it('should successfully parse and validate a batch of New NPA Format records', () => {
        const rows = [
            { 'NPA Number': 'NPA/03/04/2023/0395', Name: 'MANI UMAR DAHIRU' },
            { 'NPA Number': 'NPA/03/08/2024/0112', Name: 'ABDULSHAKUR MAI GANDI' },
            { 'NPA Number': 'NPA/03/02/2022/0451', Name: 'CHUKWUDI EMMANUEL OKONKWO' }
        ];

        const result = parseCadetImportData(rows, { activeRC: 12 });

        assert.equal(result.detectedFormat, 'NPA_FORMAT');
        assert.equal(result.totalRows, 3);
        assert.equal(result.validRows.length, 3);
        assert.equal(result.invalidRows.length, 0);

        // Record 1: 2023 -> RC 10, Squad 04
        assert.equal(result.validRows[0].name, 'MANI UMAR DAHIRU');
        assert.equal(result.validRows[0].squad, '04');
        assert.equal(result.validRows[0].course_number, 10);
        assert.equal(result.validRows[0].admission_year, 2023);
        assert.equal(result.validRows[0].year_group, 3); // (12 - 10) + 1 = 3

        // Record 2: 2024 -> RC 11, Squad 08
        assert.equal(result.validRows[1].name, 'ABDULSHAKUR MAI GANDI');
        assert.equal(result.validRows[1].squad, '08');
        assert.equal(result.validRows[1].course_number, 11);
        assert.equal(result.validRows[1].admission_year, 2024);
        assert.equal(result.validRows[1].year_group, 2); // (12 - 11) + 1 = 2

        // Record 3: 2022 -> RC 9, Squad 02
        assert.equal(result.validRows[2].name, 'CHUKWUDI EMMANUEL OKONKWO');
        assert.equal(result.validRows[2].squad, '02');
        assert.equal(result.validRows[2].course_number, 9);
        assert.equal(result.validRows[2].admission_year, 2022);
        assert.equal(result.validRows[2].year_group, 4); // (12 - 9) + 1 = 4
    });

    it('should highlight format errors and invalid admission years without failing the entire batch', () => {
        const rows = [
            { 'NPA Number': 'NPA/03/04/2023/0395', Name: 'VALID CADET' },
            { 'NPA Number': 'INVALID_FORMAT_STRING', Name: 'BAD FORMAT CADET' },
            { 'NPA Number': 'NPA/03/04/1820/0395', Name: 'ANCIENT YEAR CADET' },
            { 'NPA Number': 'NPA/03/04/2024/0991', Name: '' }, // Missing Name
        ];

        const result = parseCadetImportData(rows, { activeRC: 12 });

        assert.equal(result.totalRows, 4);
        assert.equal(result.validRows.length, 1);
        assert.equal(result.invalidRows.length, 3);

        // Row 2 Error: Malformed format
        assert.equal(result.invalidRows[0].rowNumber, 3);
        assert.match(result.invalidRows[0].errors[0], /Invalid NPA Number structure/);

        // Row 3 Error: Cannot map year 1820 to RC
        assert.equal(result.invalidRows[1].rowNumber, 4);
        assert.match(result.invalidRows[1].errors[0], /cannot be mapped to a valid Regular Course/);

        // Row 4 Error: Missing name
        assert.equal(result.invalidRows[2].rowNumber, 5);
        assert.match(result.invalidRows[2].errors[0], /Missing cadet name/);
    });

    it('should concurrently support the Legacy 3-column Template', () => {
        const legacyRows = [
            { Name: 'LEGACY CADET ONE', Squad: 'SQUAD 3', RC_Number: 12 },
            { Name: 'LEGACY CADET TWO', Squad: 'SQUAD 8', RC_Number: 11 }
        ];

        const result = parseCadetImportData(legacyRows, { activeRC: 12 });

        assert.equal(result.detectedFormat, 'LEGACY_FORMAT');
        assert.equal(result.validRows.length, 2);
        assert.equal(result.validRows[0].name, 'LEGACY CADET ONE');
        assert.equal(result.validRows[0].squad, 'SQUAD 3');
        assert.equal(result.validRows[0].course_number, 12);
        assert.equal(result.validRows[0].admission_year, 2025); // 12 + 2013 = 2025
    });

    it('should flag intra-file duplicate NPA Numbers as errors to prevent PostgreSQL 21000 conflict', () => {
        const rowsWithDuplicates = [
            { 'NPA Number': 'NPA/03/04/2023/0395', Name: 'ORIGINAL CADET' },
            { 'NPA Number': 'NPA/03/08/2024/0112', Name: 'DIFFERENT CADET' },
            { 'NPA Number': 'NPA/03/04/2023/0395', Name: 'DUPLICATE NPA CADET' }, // Duplicate of row 2
        ];

        const result = parseCadetImportData(rowsWithDuplicates, { activeRC: 12 });

        assert.equal(result.totalRows, 3);
        assert.equal(result.validRows.length, 2);
        assert.equal(result.invalidRows.length, 1);

        // Row 4 (index 2) should be flagged with duplicate error
        const dupRow = result.invalidRows[0];
        assert.equal(dupRow.rowNumber, 4);
        assert.match(dupRow.errors[0], /Duplicate NPA Number in file.*already defined on Row 2/);
    });
});

// ============================================================================
// 5. BULK COURSE PURGE GUARDRAILS & BACKUP CSV ENGINE
// ============================================================================
describe('Bulk Course Purge Guardrails & Backup CSV Engine', () => {
    it('should build high-friction confirmation phrases for single and multiple RCs', () => {
        assert.equal(buildCoursePurgeConfirmationPhrase([10]), 'DELETE RC-10 RECORDS');
        assert.equal(buildCoursePurgeConfirmationPhrase([11, 9, 10]), 'DELETE RC-9, RC-10, RC-11 RECORDS');
        assert.equal(buildCoursePurgeConfirmationPhrase([]), 'DELETE COURSE RECORDS');
    });

    it('should generate a valid CSV backup compatible with the Dual-Format Enrollment Engine', () => {
        const sampleCadets = [
            {
                npa_number: 'NPA/03/04/2023/0395',
                name: 'MANI UMAR DAHIRU',
                squad: '04',
                course_number: 10,
                admission_year: 2023,
                status: 'ACTIVE',
                year_group: 3
            },
            {
                npa_number: 'NPA/03/08/2024/0112',
                name: 'ABDULSHAKUR MAI GANDI',
                squad: '08',
                course_number: 11,
                admission_year: 2024,
                status: 'ACTIVE',
                year_group: 2
            }
        ];

        const csv = generateCourseBackupCSV(sampleCadets);
        assert.ok(csv.startsWith('NPA Number,Name,Squad,RC_Number,Admission_Year,Status,Year_Group\n'));
        assert.ok(csv.includes('NPA/03/04/2023/0395,MANI UMAR DAHIRU,04,10,2023,ACTIVE,3'));
        assert.ok(csv.includes('NPA/03/08/2024/0112,ABDULSHAKUR MAI GANDI,08,11,2024,ACTIVE,2'));
    });
});

// ============================================================================
// 6. SUBMISSION HISTORY DATE FILTER & RANGE SELECTOR ENGINE
// ============================================================================
describe('Submission History Date Filter & Range Selector Engine', () => {
    // Reference date: Tuesday, Nov 10, 2026
    const refDate = new Date(2026, 10, 10, 12, 0, 0);

    it('should return empty bounds for All Time preset', () => {
        const bounds = computeDateRangeForPreset('all', undefined, undefined, refDate);
        assert.equal(bounds.startISO, undefined);
        assert.equal(bounds.endISO, undefined);
        assert.equal(formatActiveFilterBadge('all', bounds), null);
    });

    it('should compute exact ISO 8601 bounds for Today, This Week, This Month, and Last 30 Days', () => {
        const todayBounds = computeDateRangeForPreset('today', undefined, undefined, refDate);
        assert.equal(todayBounds.startDateStr, '2026-11-10');
        assert.equal(todayBounds.endDateStr, '2026-11-10');
        assert.equal(todayBounds.startISO, '2026-11-10T00:00:00.000Z');
        assert.equal(todayBounds.endISO, '2026-11-10T23:59:59.999Z');

        // Nov 10, 2026 is a Tuesday -> Monday is Nov 9, Sunday is Nov 15
        const weekBounds = computeDateRangeForPreset('this_week', undefined, undefined, refDate);
        assert.equal(weekBounds.startDateStr, '2026-11-09');
        assert.equal(weekBounds.endDateStr, '2026-11-15');

        // November 2026: Nov 1 to Nov 30
        const monthBounds = computeDateRangeForPreset('this_month', undefined, undefined, refDate);
        assert.equal(monthBounds.startDateStr, '2026-11-01');
        assert.equal(monthBounds.endDateStr, '2026-11-30');

        // Last 30 days inclusive of Nov 10: Oct 12 to Nov 10
        const last30Bounds = computeDateRangeForPreset('last_30_days', undefined, undefined, refDate);
        assert.equal(last30Bounds.startDateStr, '2026-10-12');
        assert.equal(last30Bounds.endDateStr, '2026-11-10');
    });

    it('should handle Custom Range and auto-swap inverted start/end dates', () => {
        const customBounds = computeDateRangeForPreset('custom', '2026-10-31', '2026-10-01', refDate);
        assert.equal(customBounds.startDateStr, '2026-10-01');
        assert.equal(customBounds.endDateStr, '2026-10-31');
        assert.equal(
            formatActiveFilterBadge('custom', customBounds),
            'Filtered: Oct 1, 2026 – Oct 31, 2026'
        );
    });

    it('should accurately filter parade records against active date bounds', () => {
        const octBounds = computeDateRangeForPreset('custom', '2026-10-01', '2026-10-31', refDate);
        assert.equal(
            doesRecordMatchDateBounds({ date: '2026-10-15', createdAt: '2026-10-15T08:00:00Z' }, octBounds),
            true
        );
        assert.equal(
            doesRecordMatchDateBounds({ date: '2026-11-02', createdAt: '2026-11-02T08:00:00Z' }, octBounds),
            false
        );
    });
});



