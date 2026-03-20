import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ParadeRecord } from '../types';
import { dbService } from './dbService';
import { calculateCurrentLevel } from '../utils/rcHelpers';

export const reportService = {
    generateCommandReturn: (records: ParadeRecord[], title: string = "OFFICIAL PARADE STATE - COMMAND RETURN") => {
        const doc = new jsPDF() as any;

        // Header (Upscaled by 35%)
        doc.setFontSize(24.3); // 18 * 1.35
        doc.setTextColor(30, 58, 138); // Blue 900
        doc.text("NIGERIA POLICE ACADEMY", 105, 20, { align: 'center' });

        doc.setFontSize(18.9); // 14 * 1.35
        doc.text(title, 105, 32, { align: 'center' });

        doc.setFontSize(13.5); // 10 * 1.35
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleString()} | STATUS: OFFICIAL_COPY`, 105, 42, { align: 'center' });

        // Table Data
        const tableData = records.map(r => [
            r.date,
            r.courseName,
            `Year ${r.yearGroup}`,
            r.presentCount,
            r.absentCount,
            r.sickCount,
            r.detentionCount,
            r.grandTotal
        ]);

        doc.autoTable({
            startY: 55,
            head: [['Date', 'Course', 'Year', 'Pres.', 'Abs.', 'Sick', 'Det.', 'Total']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillStyle: 'fill', fillColor: [30, 58, 138], textColor: 255, fontSize: 11 },
            alternateRowStyles: { fillColor: [241, 245, 249] },
            styles: { fontSize: 10.8, cellPadding: 5 } // 8 * 1.35
        });

        // Sign-off (Upscaled)
        const finalY = (doc as any).lastAutoTable.finalY + 30;
        doc.setFontSize(13.5);
        doc.setTextColor(0);
        doc.text("__________________________", 30, finalY);
        doc.text("COMMANDANT SIGNATURE", 30, finalY + 10);

        doc.text("__________________________", 140, finalY);
        doc.text("ACADEMIC REGISTRAR", 140, finalY + 10);

        doc.save(`Command_Return_${new Date().toISOString().split('T')[0]}.pdf`);
    },

    generateCommandantReport: async (data: {
        volumeStats: { absences: number, medical: number, detention: number },
        activeRC: number,
        officerName: string,
        rangeLabel: string,
        yearGroup?: number,
        courseWiseData: Array<{
            rc: number,
            volume: number,
            expected: number,
            present: number,
            avgAttendance: number,
            standing: string,
            topDefaulters: Array<{ id: string, name: string, squad: string, absences: number, standing: string }>
        }>
    }) => {
        const doc = new jsPDF() as any;
        const { volumeStats, activeRC, officerName, rangeLabel, courseWiseData, yearGroup: passedYearGroup } = data;

        // Extract year group if not passed, prioritizing highest (usually most senior in Academy report)
        const derivedYearGroup = passedYearGroup || (courseWiseData.length > 0
            ? Math.max(...courseWiseData.map(c => calculateCurrentLevel(c.rc, activeRC)))
            : 5);

        const generateAuditId = () => {
            try {
                // 1. Browser/Modern Node Global
                if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                    return crypto.randomUUID().toUpperCase();
                }
                // 2. Browser window.crypto fallback
                if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
                    return window.crypto.randomUUID().toUpperCase();
                }
                // 3. High-entropy fallback
                return Math.random().toString(36).substring(2, 15).toUpperCase() +
                    Math.random().toString(36).substring(2, 15).toUpperCase();
            } catch (e) {
                return 'RN-' + Date.now().toString(36).toUpperCase();
            }
        };

        const auditId = generateAuditId();

        const logoImg = '/logo.png';

        // 1. Structural Border
        doc.setDrawColor(30, 58, 138);
        doc.setLineWidth(1);
        doc.rect(5, 5, 200, 287);

        // 2. Monochromatic Watermark Component
        const addWatermark = (pdf: any) => {
            try {
                // Centered monochromatic watermark (simulate with low opacity)
                pdf.saveGraphicsState();
                pdf.setGState(new pdf.GState({ opacity: 0.06 }));
                const w = 120; // ~60% of A4 width (210mm)
                const h = 120;
                pdf.addImage(logoImg, 'PNG', (210 - w) / 2, (297 - h) / 2, w, h);
                pdf.restoreGraphicsState();
            } catch (e) {
                // Fallback text watermark if logo/GState fails
                pdf.setTextColor(245);
                pdf.setFontSize(40);
                pdf.text("NIGERIAN POLICE ACADEMY", 105, 140, { align: 'center', angle: 45 });
            }
        };

        addWatermark(doc);

        // 3. Briefing Header (Left-Aligned Logo)
        try {
            doc.addImage(logoImg, 'PNG', 15, 12, 22, 22);
        } catch (e) {
            console.warn('Logo missing');
        }

        doc.setTextColor(30, 58, 138);
        doc.setFontSize(24.3); // 18 * 1.35
        doc.setFont('helvetica', 'bold');
        doc.text('WEEKLY ACADEMY REPORT', 42, 22);

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(rangeLabel.toUpperCase(), 42, 30);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`OFFICER IN CHARGE: ${officerName} | AUDIT ID: ${auditId}`, 42, 36);

        // 4. Section A: Academy Snapshot (Weekly Aggregated)
        doc.setDrawColor(30, 58, 138);
        doc.setLineWidth(0.5);
        doc.line(15, 45, 195, 45); // Divider

        doc.setFontSize(14.8);
        doc.setTextColor(30, 58, 138);
        doc.setFont('helvetica', 'bold');
        doc.text("SECTION A: ACADEMY SNAPSHOT (WEEKLY AGGREGATE)", 15, 55);

        // Framed Metric Boxes
        const startY = 62;
        const boxWidth = 55;
        const boxHeight = 25;

        const renderBox = (x: number, title: string, val: number, color: number[]) => {
            doc.setDrawColor(30, 58, 138);
            doc.rect(x, startY, boxWidth, boxHeight);

            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text(title, x + 5, startY + 8);

            if (val === 0) {
                doc.setTextColor(5, 150, 105); // Emerald-700
                doc.setFont('courier', 'bold');
                doc.setFontSize(16);
                doc.text("NIL", x + boxWidth / 2, startY + 18, { align: 'center' });
            } else {
                doc.setTextColor(color[0], color[1], color[2]);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(18);
                doc.text(val.toString(), x + boxWidth / 2, startY + 18, { align: 'center' });
            }
            doc.setFont('helvetica', 'normal');
        };

        renderBox(15, "TOTAL ABSENCES", volumeStats.absences, [159, 18, 57]);
        renderBox(75, "MEDICAL (FI)", volumeStats.medical, [180, 83, 9]);
        renderBox(135, "DETENTION VOLUME", volumeStats.detention, [67, 56, 202]);

        // 5. Section B: Course Accountability (Longitudinal Registry)
        let currentY = 105;
        doc.setFontSize(14.8);
        doc.setTextColor(30, 58, 138);
        doc.setFont('helvetica', 'bold');
        doc.text("SECTION B: COURSE PERFORMANCE MATRICES", 15, currentY);
        currentY += 10;

        courseWiseData.forEach((course) => {
            if (currentY > 230) {
                doc.addPage();
                doc.setDrawColor(30, 58, 138);
                doc.rect(5, 5, 200, 287);
                addWatermark(doc);
                currentY = 25;
            }

            // Tactical Sub-header
            doc.setDrawColor(30, 58, 138);
            doc.setLineWidth(1.5);
            doc.line(15, currentY - 5, 15, currentY + 5);

            doc.setFontSize(13.5);
            doc.setTextColor(30, 58, 138);
            doc.setFont('helvetica', 'bold');
            doc.text(`REGULAR COURSE ${course.rc}`, 20, currentY);

            // Performance Statistics Row
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);

            const standingColor = course.avgAttendance >= 95 ? [5, 150, 105] : course.avgAttendance < 85 ? [185, 28, 28] : [30, 58, 138];

            doc.text(`Standing: `, 20, currentY + 8);
            doc.setTextColor(standingColor[0], standingColor[1], standingColor[2]);
            doc.setFont('helvetica', 'bold');
            doc.text(course.standing.toUpperCase(), 37, currentY + 8);

            doc.setTextColor(100);
            doc.setFont('helvetica', 'normal');
            doc.text(` | Avg. Weekly Attendance: `, 60, currentY + 8);
            doc.setTextColor(standingColor[0], standingColor[1], standingColor[2]);
            doc.setFont('helvetica', 'bold');
            doc.text(`${course.avgAttendance.toFixed(1)}%`, 108, currentY + 8);

            currentY += 12;

            // 3. Operational Defaulter Trace Registry
            if (course.topDefaulters.length === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(20, currentY, 170, 12, 'F');
                doc.setFontSize(9);
                doc.setTextColor(5, 150, 105);
                doc.setFont('helvetica', 'bold');
                doc.text("NIL (NO CRITICAL DEFAULTERS BY ORDER)", 105, currentY + 8, { align: 'center' });
                currentY += 22;
            } else {
                autoTable(doc, {
                    startY: currentY,
                    head: [['SQUAD', 'CADET NAME', 'WEEKLY ABSENCES']],
                    body: course.topDefaulters.map((c: any) => {
                        const names = c.name.split(' ');
                        const surnameFirst = names.length > 1 ? `${names[names.length - 1]}, ${names.slice(0, -1).join(' ')}` : c.name;
                        return [
                            c.squad?.toUpperCase() || 'N/A',
                            surnameFirst.toUpperCase(),
                            c.absences
                        ];
                    }),
                    headStyles: { fillColor: [30, 58, 138], fontSize: 10, halign: 'left' },
                    styles: { fontSize: 13.5, cellPadding: 5 },
                    columnStyles: {
                        0: { fontStyle: 'bold', cellWidth: 40 },
                        1: { fontStyle: 'bold' },
                        2: { textColor: [159, 18, 57], fontStyle: 'bold', halign: 'right', font: 'courier' }
                    },
                    margin: { left: 20, right: 20 },
                    didParseCell: (data) => {
                        if (data.section === 'body') {
                            data.cell.styles.minCellHeight = (data.cell.styles.fontSize * 1.5);
                        }
                    }
                });
                currentY = (doc as any).lastAutoTable.finalY + 15;
            }

            // Section Separation Rule
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(15, currentY - 5, 195, currentY - 5);
        });

        // 6. Section C: Commandant’s Assessment (Serif / Times)
        if (currentY > 240) {
            doc.addPage();
            doc.setDrawColor(30, 58, 138);
            doc.rect(5, 5, 200, 287);
            addWatermark(doc);
            currentY = 25;
        }

        doc.setFontSize(14.8);
        doc.setTextColor(30, 58, 138);
        doc.setFont('helvetica', 'bold');
        doc.text("SECTION C: COMMANDANT'S ASSESSMENT", 15, currentY);

        const sortedByAttendance = [...courseWiseData].sort((a, b) => b.avgAttendance - a.avgAttendance);
        const bestRC = sortedByAttendance[0];
        const worstRC = sortedByAttendance[sortedByAttendance.length - 1];

        let narrative = `Institutional Performance Summary: Academy average attendance remains stable at ${((courseWiseData.reduce((acc, c) => acc + c.avgAttendance, 0) / courseWiseData.length)).toFixed(1)}%. RC ${bestRC.rc} currently leads with ${bestRC.avgAttendance.toFixed(1)}% attendance, while RC ${worstRC.rc} requires longitudinal monitoring at ${worstRC.avgAttendance.toFixed(1)}%. Administrative protocols for critical defaulters remain strictly enforced.`;

        doc.setFont('times', 'italic');
        doc.setFontSize(13);
        doc.setTextColor(0);
        const splitNarrative = doc.splitTextToSize(narrative, 170);
        doc.text(splitNarrative, 15, currentY + 10);

        // Security Footing & Sign-off
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text('__________________________', 140, 260);
        doc.text('OFFICE OF THE COMMANDANT', 140, 266);
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`VALIDATED SECURE_ID: ${auditId}`, 140, 272);

        // Footer
        doc.setFontSize(9);
        doc.text(`LONGITUDINAL ACADEMY REPORT • GENERATED: ${new Date().toLocaleString()} • SECURE_COPY`, 105, 282, { align: 'center' });

        // Traceability Notification
        await dbService.addNotification({
            type: 'system',
            title: 'Weekly Academy Report Produced',
            content: `Longitudinal Performance Report (Audit ID: ${auditId})`,
            timestamp: new Date().toISOString(),
            read: false,
            officerName: officerName,
            yearGroup: derivedYearGroup,
            courseNumber: activeRC
        });

        doc.save(`WEEKLY_ACADEMY_REPORT_${new Date().toISOString().split('T')[0]}.pdf`);
    },

    generateNominalRoll: async (data: {
        rc: number,
        cadets: Array<{
            id: string | number,
            name: string,
            squad: string
        }>,
        officerName: string
    }) => {
        const doc = new jsPDF() as any;
        const { rc, cadets, officerName } = data;

        const generateAuditId = () => {
            try {
                if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                    return crypto.randomUUID().toUpperCase();
                }
                if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
                    return window.crypto.randomUUID().toUpperCase();
                }
                return Math.random().toString(36).substring(2, 15).toUpperCase();
            } catch (e) {
                return 'NR-' + Date.now().toString(36).toUpperCase();
            }
        };

        const auditId = generateAuditId();
        const logoImg = '/logo.png';

        // Helper: Watermark on current page
        const addWatermark = (pdf: any) => {
            try {
                pdf.saveGraphicsState();
                pdf.setGState(new pdf.GState({ opacity: 0.05 }));
                pdf.addImage(logoImg, 'PNG', 45, 88, 120, 120);
                pdf.restoreGraphicsState();
            } catch (e) { /* skip if no logo */ }
        };

        // Helper: Page header (global cover header + per-squad header)
        const drawPageHeader = (pdf: any, squadLabel: string, squadIndex: number, totalSquads: number) => {
            // Border
            pdf.setDrawColor(30, 58, 138);
            pdf.setLineWidth(1);
            pdf.rect(5, 5, 200, 287);

            // Watermark
            addWatermark(pdf);

            // Academy Header Block
            pdf.setFillColor(30, 58, 138);
            pdf.rect(10, 10, 190, 36, 'F');

            try {
                pdf.addImage(logoImg, 'PNG', 14, 14, 20, 20);
            } catch (e) { }

            pdf.setTextColor(255, 255, 255);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(18);
            pdf.text('NIGERIAN POLICE ACADEMY', 110, 22, { align: 'center' });

            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`NOMINAL ROLL — REGULAR COURSE ${rc} | OFFICER IN CHARGE: ${officerName.toUpperCase()}`, 110, 31, { align: 'center' });
            pdf.text(`AUDIT ID: ${auditId}`, 110, 39, { align: 'center' });

            // Squad Divider — always prefix SQUAD if not already present
            const displayLabel = squadLabel.match(/^\d+$/) ? `SQUAD ${squadLabel}` : squadLabel;
            pdf.setTextColor(30, 58, 138);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(22);
            pdf.text(displayLabel.toUpperCase(), 110, 60, { align: 'center' });

            pdf.setDrawColor(30, 58, 138);
            pdf.setLineWidth(0.5);
            pdf.line(15, 64, 195, 64);

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(120);
            pdf.text(`PAGE ${squadIndex + 1} OF ${totalSquads}`, 195, 72, { align: 'right' });
        };

        // --- 1. Group cadets by Squad (already sorted by DB) ---
        const squadMap = new Map<string, typeof cadets>();
        cadets.forEach(c => {
            const key = c.squad || 'UNASSIGNED';
            if (!squadMap.has(key)) squadMap.set(key, []);
            squadMap.get(key)!.push(c);
        });

        const squads = Array.from(squadMap.entries())
            .sort(([a], [b]) => {
                // Extract the trailing integer from the squad name for numeric ordering
                // e.g. "SQUAD 1" → 1, "SQUAD 12" → 12, "1" → 1, "A2" → 2
                const numA = parseInt((a.match(/(\d+)\s*$/) || ['0', '0'])[1], 10);
                const numB = parseInt((b.match(/(\d+)\s*$/) || ['0', '0'])[1], 10);
                if (!isNaN(numA) && !isNaN(numB) && (numA !== 0 || numB !== 0)) return numA - numB;
                return a.localeCompare(b);
            });
        const totalSquads = squads.length;

        // --- 2. Render each squad — always ONE page, dynamically compressed ---
        let isFirstPage = true;

        squads.forEach(([squadName, members], idx) => {
            if (!isFirstPage) doc.addPage();
            isFirstPage = false;

            drawPageHeader(doc, squadName, idx, totalSquads);

            const count = members.length;
            const availableH = 270 - 78; // usable height after header

            // Determine number of columns needed (2, 3, or 4) to fit all names
            let numCols = 2;
            if (count > numCols * Math.floor(availableH / 8)) numCols = 3;
            if (count > numCols * Math.floor(availableH / 7)) numCols = 4;

            const rowsPerCol = Math.ceil(count / numCols);

            // Auto-scale row height to use available space, min 6 pt
            const rowH = Math.max(6, Math.floor(availableH / rowsPerCol));

            // Auto-scale font, min 6pt, max 10pt
            const nameFontSize = Math.max(6, Math.min(10, rowH - 1));

            const colWidth = Math.floor(180 / numCols);
            const startY = 78;

            // Column header bars
            for (let col = 0; col < numCols; col++) {
                const colX = 15 + col * colWidth;
                doc.setFillColor(30, 58, 138);
                doc.rect(colX, startY, colWidth - 2, 7, 'F');
                doc.setTextColor(255);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.text('S/N   CADET NAME', colX + 2, startY + 5);
            }

            // Auto-fit font: shrink until the longest name fits the column width
            const snWidth = 10; // reserved for S/N prefix
            const nameAreaWidth = colWidth - snWidth - 4; // available for name text
            let nameFontFinal = nameFontSize;
            const longestName = members.reduce(
                (longest, m) => m.name.length > longest.length ? m.name : longest, ''
            ).toUpperCase();
            // Step down by 0.5pt until it fits
            while (nameFontFinal > 5) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(nameFontFinal);
                const w = doc.getTextWidth(longestName);
                if (w <= nameAreaWidth) break;
                nameFontFinal -= 0.5;
            }

            // Render names
            members.forEach((member, idx) => {
                const col = Math.floor(idx / rowsPerCol);
                const rowInCol = idx % rowsPerCol;
                const colX = 15 + col * colWidth;
                const y = startY + 7 + rowInCol * rowH + rowH - 2;

                // Alternating row background
                if (rowInCol % 2 === 0) {
                    doc.setFillColor(248, 250, 252);
                    doc.rect(colX, y - rowH + 2, colWidth - 2, rowH, 'F');
                }

                doc.setTextColor(30, 58, 138);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(Math.max(5, nameFontFinal - 1));
                doc.text(`${idx + 1}.`, colX + 2, y);

                doc.setTextColor(20, 20, 20);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(nameFontFinal);
                doc.text(member.name.toUpperCase(), colX + snWidth, y);
            });

            // Footer
            doc.setDrawColor(200, 210, 230);
            doc.setLineWidth(0.3);
            doc.line(15, 278, 195, 278);
            doc.setFont('times', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(
                `GENERATED: ${new Date().toLocaleString()} | OFFICIAL_COPY | SECURE_ID: ${auditId}`,
                105, 283, { align: 'center' }
            );
        });

        doc.save(`NOMINAL_ROLL_RC${rc}_${new Date().toISOString().split('T')[0]}.pdf`);
    }
};
